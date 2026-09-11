const fs = require('fs');

const GROUP_ID = 5971;
const GROUP_URL = `https://api.wiseoldman.net/v2/groups/${GROUP_ID}`;
const HISCORES_BASE = `https://api.wiseoldman.net/v2/groups/${GROUP_ID}/hiscores`;

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

async function updateLeaderboardData() {
  const memberMap = {}; // Lowercase username -> player object

  console.log(`Fetching official group data from ${GROUP_URL}...`);
  
  // Step 1: Fetch group data to retrieve full memberships list
  try {
    const groupRes = await fetch(GROUP_URL);
    if (!groupRes.ok) throw new Error(`Failed to fetch group: ${groupRes.statusText}`);
    
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
      const response = await fetch(`${HISCORES_BASE}?metric=${metric}`);
      
      if (!response.ok) {
        console.warn(`Failed to fetch ${metric}: ${response.statusText}`);
        continue;
      }

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

      await sleep(1000); // 1s buffer for rate limiting
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
