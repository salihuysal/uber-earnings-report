/**
 * API-based driver earnings extractor.
 *
 * Uses the Uber Supplier Portal GraphQL API directly instead of DOM scraping.
 * This is dramatically faster and more reliable: one API call replaces opening
 * drawers, expanding sections, and parsing accessibility tree buttons.
 *
 * Key API: POST /graphql  operationName=getEarnerBreakdownsV2
 *
 * Amount format: amountE5 (integer cents × 1000, e.g. 41726000 = €417.26)
 */

const CONFIG = require('./config');

const EARNER_BREAKDOWN_QUERY = `query getEarnerBreakdownsV2($supplierUuid: ID!, $timeRange: OneOfTimeRange__Input, $driverListOrPageOptions: DriverListOrPagination, $driverList: [ID!], $pageOptions: PaginationOption__Input, $locale: String, $excludeAdjustmentItems: Boolean) {
  getEarnerBreakdownsV2(
    supplierUuid: $supplierUuid
    timeRange: $timeRange
    driverList: $driverList
    pageOptions: $pageOptions
    driverListOrPageOptions: $driverListOrPageOptions
    locale: $locale
    excludeAdjustmentItems: $excludeAdjustmentItems
  ) {
    earnerEarningsBreakdowns {
      earnerUuid
      earnerMetadata {
        pictureUrl
        name
      }
      tripInfos {
        tripAttributeName
        value
      }
      netOutstanding {
        amountE5
        currencyCode
      }
      earnings {
        localizedCategoryLabel
        categoryName
        amount { amountE5 currencyCode }
        children {
          localizedCategoryLabel
          categoryName
          amount { amountE5 currencyCode }
          children {
            localizedCategoryLabel
            categoryName
            amount { amountE5 currencyCode }
          }
        }
      }
      reimbursements {
        localizedCategoryLabel
        categoryName
        amount { amountE5 currencyCode }
        children {
          localizedCategoryLabel
          categoryName
          amount { amountE5 currencyCode }
          children {
            localizedCategoryLabel
            categoryName
            amount { amountE5 currencyCode }
          }
        }
      }
      payouts {
        localizedCategoryLabel
        categoryName
        amount { amountE5 currencyCode }
        children {
          localizedCategoryLabel
          categoryName
          amount { amountE5 currencyCode }
        }
      }
      adjustmentsFromPreviousPeriods {
        localizedCategoryLabel
        categoryName
        amount { amountE5 currencyCode }
        children {
          localizedCategoryLabel
          categoryName
          amount { amountE5 currencyCode }
          children {
            localizedCategoryLabel
            categoryName
            amount { amountE5 currencyCode }
            children {
              localizedCategoryLabel
              categoryName
              amount { amountE5 currencyCode }
            }
          }
        }
      }
    }
    pageInfo {
      nextPageToken
    }
  }
}`;

/**
 * Convert amountE5 string to a number in the actual currency unit.
 * e.g. "41726000" -> 417.26
 */
function fromE5(amountE5) {
  const val = parseInt(amountE5, 10);
  return isNaN(val) ? 0 : val / 100000;
}

/**
 * Find a child breakdown by categoryName.
 */
function findChild(children, categoryName) {
  if (!children || !Array.isArray(children)) return null;
  return children.find(c => c.categoryName === categoryName) || null;
}

/**
 * Extract our standard data fields from a single earner breakdown.
 */
function parseEarnerBreakdown(earner) {
  const earnings = earner.earnings || {};
  const reimbursements = earner.reimbursements || {};
  const payouts = earner.payouts || {};
  const adjustments = earner.adjustmentsFromPreviousPeriods || {};

  const earningsChildren = earnings.children || [];
  const payoutsChildren = payouts.children || [];

  const fare = findChild(earningsChildren, 'fare');
  const serviceFee = findChild(earningsChildren, 'service_fee');
  const tip = findChild(earningsChildren, 'tip');
  const promotion = findChild(earningsChildren, 'promotion');
  const cashCollected = findChild(payoutsChildren, 'cash_collected');

  return {
    name: earner.earnerMetadata?.name || 'Unknown',
    earnerUuid: earner.earnerUuid,
    tripCount: getTripInfo(earner, 'TRIP_ATTRIBUTE_NAME_COUNT'),
    tripDistance: getTripInfo(earner, 'TRIP_ATTRIBUTE_NAME_DISTRANCE'),
    fare: fromE5(fare?.amount?.amountE5),
    serviceFee: fromE5(serviceFee?.amount?.amountE5),
    tip: fromE5(tip?.amount?.amountE5),
    promotions: fromE5(promotion?.amount?.amountE5),
    yourEarnings: fromE5(earnings.amount?.amountE5) + fromE5(reimbursements.amount?.amountE5),
    totalEarning: fromE5(earnings.amount?.amountE5),
    refundsExpenses: fromE5(reimbursements.amount?.amountE5),
    adjustments: fromE5(adjustments.amount?.amountE5),
    cashCollected: fromE5(cashCollected?.amount?.amountE5),
    payout: fromE5(payouts.amount?.amountE5),
    netEarnings: fromE5(earner.netOutstanding?.amountE5),
    currencyCode: earner.netOutstanding?.currencyCode || 'EUR',
  };
}

function getTripInfo(earner, attributeName) {
  const info = (earner.tripInfos || []).find(t => t.tripAttributeName === attributeName);
  return info ? info.value : '';
}

/**
 * Fetch all earner breakdowns for a given supplier and time range via GraphQL.
 * Handles pagination automatically.
 *
 * @param {function} fetchFn - A fetch function: (url, options) => Response
 *   In browser context: window.fetch (same-origin, cookies included)
 *   In Node/Electron: a configured fetch with cookies
 * @param {object} params
 * @param {string} params.supplierUuid - Organization UUID
 * @param {string} params.startTimeMs - Start time in unix milliseconds
 * @param {string} params.endTimeMs - End time in unix milliseconds
 * @param {number} [params.pageSize=10] - Drivers per page (API max is 10)
 * @param {function} [params.log] - Logger function
 * @returns {Promise<Array>} Array of parsed earner data
 */
async function fetchAllEarnerBreakdowns(fetchFn, params) {
  const {
    supplierUuid,
    startTimeMs,
    endTimeMs,
    pageSize = 10,
    log = () => {},
  } = params;

  const allEarners = [];
  let pageToken = '';
  let pageNum = 1;

  while (true) {
    log(`[API] Fetching page ${pageNum} (token: ${pageToken || 'initial'})...`);

    const body = {
      operationName: 'getEarnerBreakdownsV2',
      variables: {
        supplierUuid,
        timeRange: {
          unixMilliOrDate: 'Unix_Time_Range',
          startTimeUnixMillis: String(startTimeMs),
          endTimeUnixMillis: String(endTimeMs),
        },
        driverListOrPageOptions: 'Page_Options',
        pageOptions: {
          pageSize,
          pageToken,
        },
        driverList: null,
        excludeAdjustmentItems: true,
      },
      query: EARNER_BREAKDOWN_QUERY,
    };

    const response = await fetchFn(`${CONFIG.urls.base}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': 'x',
      },
      credentials: 'include',
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    const data = json.data?.getEarnerBreakdownsV2;

    if (!data) {
      const errorMsg = json.errors?.[0]?.message || JSON.stringify(json).substring(0, 200);
      throw new Error(`GraphQL error: ${errorMsg}`);
    }

    const breakdowns = data.earnerEarningsBreakdowns || [];
    log(`[API] Page ${pageNum}: ${breakdowns.length} drivers`);

    for (const earner of breakdowns) {
      allEarners.push(parseEarnerBreakdown(earner));
    }

    const nextToken = data.pageInfo?.nextPageToken || null;
    if (nextToken && breakdowns.length > 0) {
      pageToken = nextToken;
      pageNum++;
    } else {
      break;
    }
  }

  log(`[API] Total: ${allEarners.length} drivers fetched`);
  return allEarners;
}

/**
 * Extract the supplier UUID from the current page URL.
 * URL format: https://supplier.uber.com/orgs/{uuid}/earnings
 */
function extractSupplierUuid(url) {
  const match = url.match(/\/orgs\/([a-f0-9-]+)/);
  return match ? match[1] : null;
}

/**
 * Run the full API-based extraction.
 * Produces the same collectedData format as the DOM-based extractor.
 *
 * @param {function} fetchFn - fetch function (same-origin in browser)
 * @param {object} options
 * @param {string} options.supplierUuid - Organization UUID
 * @param {string} options.startTimeMs - Start unix millis
 * @param {string} options.endTimeMs - End unix millis
 * @param {string} options.periodLabel - Label for the period column
 * @param {string[]} [options.driverFilter] - Optional driver name filter
 * @param {function} [options.log] - Logger
 * @param {function} [options.onDriverExtracted] - Callback per driver
 * @returns {Promise<object>} collectedData: { driverName: [row, ...] }
 */
async function runApiExtraction(fetchFn, options) {
  const {
    supplierUuid,
    startTimeMs,
    endTimeMs,
    periodLabel,
    driverFilter,
    log = () => {},
    onDriverExtracted,
  } = options;

  log('=== API-based Extraction ===');
  log(`Supplier: ${supplierUuid}`);
  log(`Range: ${startTimeMs} - ${endTimeMs}`);

  const earners = await fetchAllEarnerBreakdowns(fetchFn, {
    supplierUuid,
    startTimeMs,
    endTimeMs,
    log,
  });

  const collectedData = {};

  for (const earner of earners) {
    if (driverFilter && driverFilter.length > 0) {
      const lower = earner.name.toLowerCase();
      const match = driverFilter.some(f => lower.includes(f.toLowerCase()));
      if (!match) continue;
    }

    const row = {
      period: periodLabel,
      fare: earner.fare,
      serviceFee: earner.serviceFee,
      tip: earner.tip,
      promotions: earner.promotions,
      totalEarning: earner.totalEarning,
      refundsExpenses: earner.refundsExpenses,
      yourEarnings: earner.yourEarnings,
      adjustments: earner.adjustments,
      cashCollected: earner.cashCollected,
      payout: earner.payout,
      netEarnings: earner.netEarnings,
    };

    if (!collectedData[earner.name]) {
      collectedData[earner.name] = [];
    }
    collectedData[earner.name].push(row);

    if (onDriverExtracted) {
      onDriverExtracted({ driverName: earner.name, ...row });
    }
  }

  log(`=== ${Object.keys(collectedData).length} drivers extracted via API ===`);
  return collectedData;
}

const REPORTING_TIME_WINDOWS_QUERY = `query GetReportingTimeWindows($orgId: ID!) {
  getReportingTimeWindows(orgId: $orgId) {
    timeWindows {
      startTimeUnixMillis
      endTimeUnixMillis
    }
  }
}`;

/**
 * Fetch the reporting time windows (settlement periods) for a supplier.
 *
 * @param {function} fetchFn - fetch function
 * @param {string} supplierUuid - Organization UUID
 * @returns {Promise<Array<{startTimeMs: string, endTimeMs: string|null, label: string}>>}
 */
async function fetchReportingTimeWindows(fetchFn, supplierUuid) {
  const response = await fetchFn(`${CONFIG.urls.base}/graphql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-csrf-token': 'x',
    },
    credentials: 'include',
    body: JSON.stringify({
      operationName: 'GetReportingTimeWindows',
      variables: { orgId: supplierUuid },
      query: REPORTING_TIME_WINDOWS_QUERY,
    }),
  });

  if (!response.ok) {
    throw new Error(`GetReportingTimeWindows failed: ${response.status}`);
  }

  const json = await response.json();
  const windows = json.data?.getReportingTimeWindows?.timeWindows || [];

  return windows.map((w, i) => {
    const startMs = w.startTimeUnixMillis?.value || w.startTimeUnixMillis;
    const endMs = w.endTimeUnixMillis?.value || w.endTimeUnixMillis;
    const startDate = new Date(Number(startMs));
    const endDate = endMs ? new Date(Number(endMs)) : new Date();
    const fmt = d => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return {
      startTimeMs: String(startMs),
      endTimeMs: endMs ? String(endMs) : String(Date.now()),
      label: `${fmt(startDate)} - ${fmt(endDate)}`,
      isCurrent: !endMs,
    };
  });
}

module.exports = {
  EARNER_BREAKDOWN_QUERY,
  REPORTING_TIME_WINDOWS_QUERY,
  fromE5,
  parseEarnerBreakdown,
  fetchAllEarnerBreakdowns,
  extractSupplierUuid,
  runApiExtraction,
  fetchReportingTimeWindows,
};
