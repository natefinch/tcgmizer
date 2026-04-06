// TCGPlayer-specific constants
export const TCGPLAYER_MIN_ORDER_PER_SELLER = 1.0; // $1 minimum per seller
export const TCGPLAYER_DIRECT_SHIPPING_COST = 3.99;
export const TCGPLAYER_DIRECT_FREE_SHIPPING_THRESHOLD = 50.0;
export const DEFAULT_FETCH_DELAY_MS = 100;
export const DEFAULT_MAX_LISTINGS_PER_CARD = 50;
export const DEFAULT_FETCH_CONCURRENCY = 5;
export const MAX_ALTERNATIVE_PRINTINGS = 10; // max alt printings to fetch per card name
export const DEFAULT_TOP_K_LISTINGS = 40; // kept for ILP after pruning
export const DEFAULT_SOLVER_TIMEOUT_S = 30;
export const LISTINGS_PER_PAGE = 50;
export const SEARCH_RESULTS_PER_PAGE = 50; // TCGPlayer search API max page size

// Default patterns for card exclusions in alternate printing search
export const DEFAULT_CARD_EXCLUSIONS = ['(Display Commander)', '(Art Series)'];

// Message types between extension components
export const MSG = {
  // Content → Background
  START_OPTIMIZATION: 'START_OPTIMIZATION',
  SOLVE_WITH_CONFIG: 'SOLVE_WITH_CONFIG',
  CANCEL_OPTIMIZATION: 'CANCEL_OPTIMIZATION',
  APPLY_CART: 'APPLY_CART',
  DUMP_DATA: 'DUMP_DATA',

  // Background → Content
  OPTIMIZATION_PROGRESS: 'OPTIMIZATION_PROGRESS',
  LISTINGS_READY: 'LISTINGS_READY',
  OPTIMIZATION_RESULT: 'OPTIMIZATION_RESULT',
  OPTIMIZATION_MULTI_RESULT: 'OPTIMIZATION_MULTI_RESULT',
  OPTIMIZATION_ERROR: 'OPTIMIZATION_ERROR',

  // Popup → Content
  TOGGLE_PANEL: 'TOGGLE_PANEL',

  // Popup → Background
  CLEAR_SELLER_CACHE: 'CLEAR_SELLER_CACHE',
  CLEAR_PRINTINGS_CACHE: 'CLEAR_PRINTINGS_CACHE',
};

// Optimization progress stages
export const STAGE = {
  READING_CART: 'READING_CART',
  FETCHING_LISTINGS: 'FETCHING_LISTINGS',
  BUILDING_ILP: 'BUILDING_ILP',
  SOLVING: 'SOLVING',
  PARSING_SOLUTION: 'PARSING_SOLUTION',
  DONE: 'DONE',
  ERROR: 'ERROR',
};
