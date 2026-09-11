const fs = require('fs');

const GROUP_ID = 5971;
const GROUP_URL = `https://api.wiseoldman.net/v2/groups/${GROUP_ID}`;
const HISCORES_BASE = `https://api.wiseoldman.net/v2/groups/${GROUP_ID}/hiscores`;

// Read API key from environment variables (GitHub Secret or .env)
const API_KEY = process.env.WOM_API_KEY || '';

// Attach x-api-key header if available
const FETCH_HEADERS = {
  'User-Agent': 'OnlyFEs-Clan-Leaderboard/1.0',
  ...(API_KEY && { 'x-api-key': API_KEY })
};

// WOM rate limits: 20 req/min (~3000ms delay) without key; 100 req/min (~600ms delay) with key
const REQUEST_DELAY_MS = API_KEY ? 700 : 3100;

const METRICS = [
  // Computed & Efficiency
  'ehp', 'ehb',

  // Skills
  'overall', 'attack', 'defence', 'strength', 'hitpoints', 'ranged', 'prayer', 'magic',
  'cooking', 'woodcutting', 'fletching', 'fishing', 'firemaking', 'crafting', 'smithing',
  'mining', 'herblore', 'agility', 'thieving', 'slayer', 'farming', 'runecrafting',
  'hunter', 'construction', 'sailing',

  // Activities & Minigames
  'bounty_hunter_hunter', 'bounty_hunter_rogue', 'clue_scrolls_all', 'clue_scrolls_beginner',
  'clue_scrolls_easy', 'clue_scrolls_medium', 'clue_scrolls_hard', 'clue_scrolls_elite',
  'clue_scrolls_master', 'last_man_standing', 'pvp_arena', 'soul_wars_zeal',
  'guardians_of_the_rift', 'colosseum_glory', 'collections_logged',

  // Bosses
  'abyssal_sire', 'alchemical_hydra', 'amoxliatl', 'araxxor', 'artio', 'barrows_chests',
  'brutus', 'bryophyta', 'callisto', 'calvarion', 'cerberus', 'chambers_of_xeric',
  'chambers_of_xeric_challenge_mode', 'chaos_elemental', 'chaos_fanatic', 'commander_zilyana',
  'corporeal_beast', 'crazy_archaeologist', 'dagannoth_prime', 'dagannoth_rex', 'dagannoth_supreme',
  'deranged_archaeologist', 'doom_of_mokhaiotl', 'duke_sucellus', 'general_graardor', 'giant_mole',
  'grotesque_guardians', 'hespori', 'kalphite_queen', 'king_black_dragon', 'kraken', 'kreearra',
  'kril_tsutsaroth', 'lunar_chests', 'mad_angel', 'maggot_king', 'mimic', 'nex', 'nightmare',
  'phosanis_nightmare', 'obor', 'phantom_muspah', 'sarachnis', 'scorpia', 'scurrius',
  'shellbane_gryphon', 'skotizo', 'sol_heredit', 'spindel', 'tempoross', 'the_gauntlet',
  'the_corrupted_gauntlet', 'the_hueycoatl', 'the_leviathan', 'the_royal_titans', 'the_whisperer',
  'theatre_of_blood', 'theatre_of_blood_hard_mode', 'thermonuclear_smoke_devil', 'tombs_of_amascut',
  'tombs_of_amascut_expert', 'tzkal_zuk', 'tztok_jad', 'vardorvis', 'venenatis', 'vetion',
  'vorkath', 'wintertodt', 'yama', 'zalcano', 'zulrah'
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch wrapper handling rate limits (429) and header injection
 */
async function fetchWithRetry(url, options = {}, retries = 5, backoff = 3000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(url, { ...options, headers: { ...FETCH_HEADERS, ...options.headers } });

    if (res.ok) return res;

    if (res.status === 429) {
      // Check if WOM provided a Retry-After header in seconds
      const retryAfterHeader = res.headers.get('retry-after');
      const waitTime = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : backoff;

      console.warn(`Rate limited (429) on ${url}. Waiting ${(waitTime / 1000).toFixed(1)}s (Attempt ${attempt}/${retries})...`);
      await sleep(waitTime);
      backoff *= 2; // Exponential backoff fallback
    } else {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
  }

  throw new Error(`Failed to fetch ${url} after ${retries} attempts due to rate limiting.`);
}

async function updateLeaderboardData() {
  const memberMap = {};

  console.log(`API Key detected: ${API_KEY ? 'Yes (700ms request delay)' : 'No (3100ms request delay)'}`);
  console.log(`Fetching official group data from ${GROUP_URL}...`);

  // Step 1: Fetch group data to retrieve full memberships list
  try {
    const groupRes = await fetchWithRetry(GROUP_URL);
    const groupData = await groupRes.json();
    const memberships = groupData.memberships || [];

    for (const m of memberships) {
      if (!m.player || !m.player.displayName) continue;

      const lowerName = m.player.displayName.toLowerCase();

      memberMap[lowerName] = {
        username: m.player.displayName,
        role: m.role || 'member',
        type: m.player.type,
        metrics: {}
      };
    }
    console.log(`Successfully mapped ${Object.keys(memberMap).length} members with official clan roles.`);
  } catch (err) {
    console.error('Error fetching group memberships:', err.message);
    process.exit(1);
  }

  // Step 2: Fetch metric rankings and merge into memberMap using lowercase username keys
  for (const metric of METRICS) {
    try {
      console.log(`Fetching metric: ${metric}...`);
      const response = await fetchWithRetry(`${HISCORES_BASE}?metric=${metric}`);
      const entries = await response.json();

      for (const entry of entries) {
        if (!entry.player || !entry.player.displayName) continue;

        const lowerName = entry.player.displayName.toLowerCase();

        if (!memberMap[lowerName]) {
          memberMap[lowerName] = {
            username: entry.player.displayName,
            role: 'member',
            type: entry.player.type,
            metrics: {}
          };
        }

        const value = entry.data.experience ?? entry.data.kills ?? entry.data.score ?? entry.data.value ?? 0;
        const level = entry.data.level ?? null;

        memberMap[lowerName].metrics[metric] = { value, level };
      }

      await sleep(REQUEST_DELAY_MS);
    } catch (err) {
      console.error(`Error processing ${metric}:`, err.message);
    }
  }

  const processedData = {
    updatedAt: new Date().toISOString(),
    members: Object.values(memberMap)
  };

  fs.writeFileSync('./data.json', JSON.stringify(processedData, null, 2));
  console.log('Successfully generated updated data.json!');
}

updateLeaderboardData();
