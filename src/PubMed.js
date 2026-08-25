/**
 * PubMed（NCBI E-utilities）からの論文取得。
 *
 * esearch で PMID を取得し、efetch でまとめて書誌情報と要旨を取得します。
 * 以前は論文 1 件ごとに efetch を呼んでいましたが、
 * 1 回のリクエストで最大 PUBMED_FETCH_BATCH_SIZE 件をまとめて取得します。
 */

const PUBMED_BASE_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

/** 1 回の efetch でまとめて取得する PMID の件数。 */
const PUBMED_FETCH_BATCH_SIZE = 200;

/**
 * NCBI のレート制限に合わせたリクエスト間隔（ミリ秒）。
 * API キーなしは 3 リクエスト/秒、API キーありは 10 リクエスト/秒が上限です。
 */
function pubMedRequestDelayMs_() {
  return getSecret('NCBI_API_KEY') ? 110 : 350;
}

/**
 * E-utilities のリクエストに共通で付けるパラメータ。
 * NCBI は tool と email の指定を推奨しています。
 * @return {!Object<string, string>}
 */
function pubMedCommonParams_() {
  const params = { tool: 'NewArticleAlertWithGAS' };
  const email = getSecret('NCBI_TOOL_EMAIL');
  if (email) params.email = email;
  const apiKey = getSecret('NCBI_API_KEY');
  if (apiKey) params.api_key = apiKey;
  return params;
}

/**
 * クエリ文字列を組み立てます。
 * @param {!Object<string, (string|number)>} params
 * @return {string}
 */
function buildQueryString(params) {
  return Object.keys(params)
    .filter(function (key) { return params[key] !== '' && params[key] !== null && params[key] !== undefined; })
    .map(function (key) { return key + '=' + encodeURIComponent(params[key]); })
    .join('&');
}

/**
 * 指定キーワードで PubMed を検索し、論文の配列を返します。
 *
 * @param {string} keyword
 * @param {!Object} config
 * @param {!Date} now
 * @return {!Array<!Object>} 論文オブジェクトの配列
 */
function searchPubMed(keyword, config, now) {
  const range = resolveSearchRange(config, now);
  const startDateStr = formatDateForApi(range.startDate, '/');
  const endDateStr = formatDateForApi(range.endDate, '/');

  const searchParams = pubMedCommonParams_();
  searchParams.db = 'pubmed';
  searchParams.term = keyword;
  searchParams.retmax = config.maxResultsPerKeyword;
  searchParams.retmode = 'json';
  searchParams.sort = 'date';
  searchParams.datetype = config.pubmedDateType;
  searchParams.mindate = startDateStr;
  searchParams.maxdate = endDateStr;

  const searchUrl = PUBMED_BASE_URL + '/esearch.fcgi?' + buildQueryString(searchParams);
  logInfo('PubMed 検索: "' + keyword + '" ' + startDateStr + ' 〜 ' + endDateStr +
    '（日付種別: ' + config.pubmedDateType + '）');

  const response = fetchWithRetry(searchUrl);
  if (!isSuccessResponse(response)) {
    logError('PubMed の検索に失敗しました (HTTP ' + response.getResponseCode() + ')');
    return [];
  }

  let pmids;
  try {
    const result = JSON.parse(response.getContentText());
    pmids = (result.esearchresult && result.esearchresult.idlist) || [];
  } catch (e) {
    logError('PubMed の検索結果を解析できませんでした', e);
    return [];
  }

  if (pmids.length === 0) return [];
  logInfo('PubMed: "' + keyword + '" で ' + pmids.length + ' 件の PMID を取得しました');

  return fetchPubMedArticles(pmids);
}

/**
 * PMID の配列から書誌情報と要旨をまとめて取得します。
 * @param {!Array<string>} pmids
 * @return {!Array<!Object>}
 */
function fetchPubMedArticles(pmids) {
  const papers = [];

  for (let offset = 0; offset < pmids.length; offset += PUBMED_FETCH_BATCH_SIZE) {
    const batch = pmids.slice(offset, offset + PUBMED_FETCH_BATCH_SIZE);

    const params = pubMedCommonParams_();
    params.db = 'pubmed';
    params.id = batch.join(',');
    params.retmode = 'xml';

    const url = PUBMED_BASE_URL + '/efetch.fcgi?' + buildQueryString(params);

    if (offset > 0) Utilities.sleep(pubMedRequestDelayMs_());

    try {
      const response = fetchWithRetry(url);
      if (!isSuccessResponse(response)) {
        logError('PubMed の詳細取得に失敗しました (HTTP ' + response.getResponseCode() + ')');
        continue;
      }
      parsePubMedXml(response.getContentText()).forEach(function (paper) {
        papers.push(paper);
      });
    } catch (e) {
      logError('PubMed の詳細取得でエラーが発生しました', e);
    }
  }

  return papers;
}

/**
 * efetch が返す XML を論文オブジェクトの配列に変換します。
 * @param {string} xmlText
 * @return {!Array<!Object>}
 */
function parsePubMedXml(xmlText) {
  const papers = [];
  let root;

  try {
    root = XmlService.parse(xmlText).getRootElement();
  } catch (e) {
    logError('PubMed の XML を解析できませんでした', e);
    return papers;
  }

  root.getChildren('PubmedArticle').forEach(function (articleElement) {
    try {
      const paper = parsePubMedArticleElement_(articleElement);
      if (paper) papers.push(paper);
    } catch (e) {
      logError('PubMed の論文情報を解析できませんでした', e);
    }
  });

  return papers;
}

/**
 * PubmedArticle 要素 1 件を論文オブジェクトに変換します。
 * @param {!Object} articleElement
 * @return {?Object}
 */
function parsePubMedArticleElement_(articleElement) {
  const citation = articleElement.getChild('MedlineCitation');
  if (!citation) return null;

  const pmid = citation.getChildText('PMID');
  if (!pmid) return null;

  const article = citation.getChild('Article');
  if (!article) return null;

  const journalElement = article.getChild('Journal');
  let journal = '';
  if (journalElement) {
    journal = journalElement.getChildText('Title') ||
      journalElement.getChildText('ISOAbbreviation') || '';
  }

  return {
    title: elementValue_(article.getChild('ArticleTitle')),
    url: 'https://pubmed.ncbi.nlm.nih.gov/' + pmid + '/',
    authors: parsePubMedAuthors_(article.getChild('AuthorList')),
    journal: journal,
    abstract: parsePubMedAbstract_(article.getChild('Abstract')),
    category: PAPER_CATEGORY_PUBMED,
  };
}

/**
 * AuthorList 要素を "Smith AB, Jones CD" 形式の文字列にします。
 * @param {?Object} authorListElement
 * @return {string}
 */
function parsePubMedAuthors_(authorListElement) {
  if (!authorListElement) return '';

  const names = authorListElement.getChildren('Author').map(function (author) {
    const collectiveName = author.getChildText('CollectiveName');
    if (collectiveName) return collectiveName;

    const lastName = author.getChildText('LastName') || '';
    const initials = author.getChildText('Initials') || '';
    if (lastName && initials) return lastName + ' ' + initials;
    return lastName || author.getChildText('ForeName') || '';
  });

  return names.filter(function (name) { return name !== ''; }).join(', ');
}

/**
 * Abstract 要素を 1 つの文字列にまとめます。
 * 構造化要旨（Label 付き）にも対応します。
 * @param {?Object} abstractElement
 * @return {string}
 */
function parsePubMedAbstract_(abstractElement) {
  if (!abstractElement) return '';

  const sections = abstractElement.getChildren('AbstractText').map(function (part) {
    const text = elementValue_(part);
    const labelAttribute = part.getAttribute('Label');
    const label = labelAttribute ? labelAttribute.getValue() : '';
    return label ? label + ': ' + text : text;
  });

  return sections.filter(function (section) { return section !== ''; }).join('\n').trim();
}

/**
 * 要素の文字列表現を返します。子要素（<i> や <sup> など）の中身も含めます。
 * @param {?Object} element
 * @return {string}
 */
function elementValue_(element) {
  if (!element) return '';
  return String(element.getValue() || '').trim();
}
