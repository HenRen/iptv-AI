/**
 * @streamwise/core — everything the StreamWise apps share.
 *
 * No DOM, no platform APIs, no Node built-ins. Whatever the platform has to
 * provide arrives through `configureCore` (see ./ports) and nothing in here
 * reaches around it.
 */

export * from './ports/index';

export * from './types/index';

export * from './iptv/normalize';
export * from './iptv/catalog';
export * from './iptv/playlists';
export * from './iptv/streamSource';
export * from './iptv/hls';
export * from './iptv/IPTVService';
export * from './iptv/m3u/parser';
export * from './iptv/m3u/adapter';
export * from './iptv/xmltv/parser';
export * from './iptv/xmltv/matcher';
export * from './iptv/xtream/client';
export * from './iptv/xtream/adapter';
export * from './iptv/mock/provider';

export * from './ai/AIService';
export * from './ai/assistant/IntentService';
export * from './ai/assistant/WatchlistService';
export * from './ai/classification/ClassificationService';
export * from './ai/diagnostics/PlaylistHealthService';
export * from './ai/epg/EPGMatchingService';
export * from './ai/epg/SportsIntelligence';
export * from './ai/providers/MockAIProvider';
export * from './ai/providers/OpenAIProvider';
export * from './ai/recommendations/RecommendationService';
export * from './ai/search/SemanticSearchService';

export * from './design/index';

export * from './utils/time';
export * from './utils/url';
