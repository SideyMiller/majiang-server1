/**
 * 国标麻将 AI 决策引擎
 * 
 * 牌编码约定（兼容 GameService 的 face 值，即原始牌号 % 50）:
 *   11-19: 1-9万
 *   21-29: 1-9条
 *   31-39: 1-9筒
 *   41:东  42:南  43:西  44:北
 *   1:中   2:发   3:白
 *   211-218: 花牌（AI不处理，调用方需自行过滤）
 * 
 * 内部计算仍使用 0-33 连续索引，公开接口接受 face 值。
 */

// ─────────────────────────────────────────────
// 牌编码映射：face值 ↔ 内部0-33索引
// ─────────────────────────────────────────────

/**
 * GameService face值 → 内部0-33索引
 */
const FACE_TO_IDX = {
  // 三元：中发白
  1: 31, 2: 32, 3: 33,
  // 万：11-19 → 0-8
  11: 0, 12: 1, 13: 2, 14: 3, 15: 4, 16: 5, 17: 6, 18: 7, 19: 8,
  // 条：21-29 → 9-17
  21: 9, 22: 10, 23: 11, 24: 12, 25: 13, 26: 14, 27: 15, 28: 16, 29: 17,
  // 筒：31-39 → 18-26
  31: 18, 32: 19, 33: 20, 34: 21, 35: 22, 36: 23, 37: 24, 38: 25, 39: 26,
  // 风：东南西北
  41: 27, 42: 28, 43: 29, 44: 30,
};

/**
 * 内部0-33索引 → GameService face值
 */
const IDX_TO_FACE = {};
for (const [face, idx] of Object.entries(FACE_TO_IDX)) {
  IDX_TO_FACE[idx] = Number(face);
}

/**
 * face值数组 → 内部0-33索引数组（过滤花牌）
 */
function facesToIndices(faceArr) {
  return faceArr
    .filter(f => f >= 1 && f <= 44 && FACE_TO_IDX[f] !== undefined)
    .map(f => FACE_TO_IDX[f]);
}

/**
 * 内部0-33索引 → face值
 */
function idxToFace(idx) {
  return IDX_TO_FACE[idx];
}

// ─────────────────────────────────────────────
// 核心：向听数计算（内部使用0-33索引）
// ─────────────────────────────────────────────

/**
 * 计算标准型向听数（4面子+1将）
 * 向听数 = 8 - 2*面子数 - max(将牌数, 1) - 搭子数
 * 返回值：0=听牌，-1=已和，正数=差几张
 */
function calcShanten(tiles) {
  // tiles: 长度34的数组，每个位置是该牌的数量
  let minShanten = 8;

  // 枚举将牌
  for (let pair = 0; pair < 34; pair++) {
    if (tiles[pair] < 2) continue;
    tiles[pair] -= 2;
    const s = calcMentsuShanten(tiles, 0, 0, 0) - 1; // -1因为将牌占了一个搭子位
    minShanten = Math.min(minShanten, s);
    tiles[pair] += 2;
  }

  // 无将牌的情况
  minShanten = Math.min(minShanten, calcMentsuShanten(tiles, 0, 0, 1));

  // 七对子
  let pairs = 0;
  for (let i = 0; i < 34; i++) if (tiles[i] >= 2) pairs++;
  minShanten = Math.min(minShanten, 6 - pairs);

  return minShanten;
}

function calcMentsuShanten(tiles, start, mentsu, taatsu) {
  // 已有面子数 + 搭子数 超过4组，剪枝
  if (mentsu + taatsu >= 4) {
    return 8 - 2 * mentsu - taatsu;
  }

  let result = 8 - 2 * mentsu - taatsu;

  for (let i = start; i < 34; i++) {
    if (tiles[i] === 0) continue;

    // 刻子
    if (tiles[i] >= 3) {
      tiles[i] -= 3;
      result = Math.min(result, calcMentsuShanten(tiles, i, mentsu + 1, taatsu));
      tiles[i] += 3;
    }

    // 顺子（只有数牌，0-26）
    if (i < 27) {
      const suit = Math.floor(i / 9);
      const num = i % 9;
      if (num <= 6 && Math.floor((i + 1) / 9) === suit && Math.floor((i + 2) / 9) === suit
          && tiles[i + 1] > 0 && tiles[i + 2] > 0) {
        tiles[i]--; tiles[i + 1]--; tiles[i + 2]--;
        result = Math.min(result, calcMentsuShanten(tiles, i, mentsu + 1, taatsu));
        tiles[i]++; tiles[i + 1]++; tiles[i + 2]++;
      }

      // 搭子：相邻两张（嵌张/两面/边张）
      if (taatsu < 4 - mentsu) {
        if (num <= 7 && Math.floor((i + 1) / 9) === suit && tiles[i + 1] > 0) {
          tiles[i]--; tiles[i + 1]--;
          result = Math.min(result, calcMentsuShanten(tiles, i, mentsu, taatsu + 1));
          tiles[i]++; tiles[i + 1]++;
        }
        if (num <= 6 && Math.floor((i + 2) / 9) === suit && tiles[i + 2] > 0) {
          tiles[i]--; tiles[i + 2]--;
          result = Math.min(result, calcMentsuShanten(tiles, i, mentsu, taatsu + 1));
          tiles[i]++; tiles[i + 2]++;
        }
      }
    }

    // 对子搭子
    if (taatsu < 4 - mentsu && tiles[i] >= 2) {
      tiles[i] -= 2;
      result = Math.min(result, calcMentsuShanten(tiles, i, mentsu, taatsu + 1));
      tiles[i] += 2;
    }
  }
  return result;
}

// ─────────────────────────────────────────────
// 危险牌判断（内部使用0-33索引）
// ─────────────────────────────────────────────

/**
 * 根据三家出牌历史，评估打出某张牌的危险度
 * @param {number} tile       - 准备打出的牌（内部索引 0-33）
 * @param {number[][]} discards - 三家各自的出牌历史（内部索引数组）
 * @returns {number}          - 0(安全) ~ 10(极危险)
 */
function calcDanger(tile, discards) {
  let danger = 0;

  for (const opponentDiscards of discards) {
    const discardSet = new Set(opponentDiscards);

    // 字牌：如果对手已经打过同种字牌，相对安全（对手大概率不需要）
    if (tile >= 27) {
      if (!discardSet.has(tile)) danger += 3; // 对手没打过，可能手里有
      continue;
    }

    const suit = Math.floor(tile / 9);
    const num = tile % 9; // 0-indexed, 即实际牌面1-9

    // 中张危险（3-7万/条/筒）：可以构成更多顺子组合
    if (num >= 2 && num <= 6) danger += 2;

    // 对手打过的牌附近通常安全（说明对手不需要那个区域）
    const nearDiscarded = [-2, -1, 1, 2].some(offset => {
      const neighbor = tile + offset;
      return neighbor >= suit * 9 && neighbor < (suit + 1) * 9 && discardSet.has(neighbor);
    });
    if (nearDiscarded) danger -= 1;
  }

  return Math.max(0, Math.min(10, danger));
}

// ─────────────────────────────────────────────
// 核心决策：选最优出牌（公开接口，接受face值）
// ─────────────────────────────────────────────

/**
 * 决定打出哪张牌
 * @param {number[]} handFaces   - 当前手牌（face值数组，长度13或14，已过滤花牌）
 * @param {number[][]} opponentDiscardFaces - 三家出牌历史（face值数组）
 * @returns {{ discard: number, shanten: number, danger: number, reason: string }}
 *          discard 为 face 值
 */
function decide(handFaces, opponentDiscardFaces = [[], [], []]) {
  // 转为内部索引
  const handIndices = facesToIndices(handFaces);
  const discardIndices = opponentDiscardFaces.map(d => facesToIndices(d));

  // 转为34元素计数数组
  const toCount = (arr) => {
    const c = new Array(34).fill(0);
    arr.forEach(t => c[t]++);
    return c;
  };

  const counts = toCount(handIndices);
  const currentShanten = calcShanten([...counts]);

  let bestDiscardIdx = -1;
  let bestScore = -Infinity;
  let bestShanten = 99;
  let bestDanger = 10;

  // 枚举每张手牌，评估打出后的收益
  const candidates = [...new Set(handIndices)]; // 去重，避免重复评估相同牌

  for (const tileIdx of candidates) {
    counts[tileIdx]--;
    const s = calcShanten([...counts]);
    counts[tileIdx]++;

    const danger = calcDanger(tileIdx, discardIndices);

    // 综合评分：向听数越小越好，危险度越低越好
    const score = -(s * 10) - danger * 0.5;

    if (s < bestShanten || (s === bestShanten && score > bestScore)) {
      bestShanten = s;
      bestScore = score;
      bestDanger = danger;
      bestDiscardIdx = tileIdx;
    }
  }

  const bestDiscardFace = idxToFace(bestDiscardIdx);
  const reason = buildReason(bestDiscardFace, bestShanten, bestDanger);

  return {
    discard: bestDiscardFace,       // 建议打出的牌（face值）
    shanten: bestShanten,            // 打出后的向听数
    danger: bestDanger,              // 该牌危险度 0-10
    reason,                          // 决策说明
    shantenBefore: currentShanten
  };
}

function buildReason(face, shanten, danger) {
  const tileName = tileToName(face);
  const shantenDesc = shanten === 0 ? '已听牌' : `距听牌还差${shanten}张`;
  const dangerDesc = danger <= 2 ? '安全' : danger <= 5 ? '有一定风险' : '较危险';
  return `打【${tileName}】→ ${shantenDesc}，危险度${danger}（${dangerDesc}）`;
}

// ─────────────────────────────────────────────
// 碰牌决策（公开接口，接受face值）
// ─────────────────────────────────────────────

/**
 * 判断是否应该碰牌
 * 策略：碰后如果向听数减少，则碰
 * @param {number[]} handFaces - 当前手牌（face值数组，13张）
 * @param {number} tileFace    - 对手打出的牌（face值）
 * @returns {boolean}
 */
function shouldPong(handFaces, tileFace) {
  const handIndices = facesToIndices(handFaces);
  const tileIdx = FACE_TO_IDX[tileFace];
  if (tileIdx === undefined) return false;

  if (handIndices.filter(t => t === tileIdx).length < 2) return false;

  const counts = new Array(34).fill(0);
  handIndices.forEach(t => counts[t]++);
  const before = calcShanten([...counts]);

  // 碰后手牌去掉2张该牌，手牌数变13→11（需要再打一张）
  counts[tileIdx] -= 2;
  const tempHand = [];
  counts.forEach((c, i) => { for (let j = 0; j < c; j++) tempHand.push(i); });
  const afterDecision = decideInternal(tempHand);
  const after = afterDecision.shanten;
  counts[tileIdx] += 2;

  return after < before; // 碰后向听数更小才碰
}

/**
 * 内部决策（使用0-33索引，供shouldPong内部调用）
 */
function decideInternal(handIndices, opponentDiscardIndices = [[], [], []]) {
  const toCount = (arr) => {
    const c = new Array(34).fill(0);
    arr.forEach(t => c[t]++);
    return c;
  };

  const counts = toCount(handIndices);
  const currentShanten = calcShanten([...counts]);

  let bestDiscardIdx = -1;
  let bestScore = -Infinity;
  let bestShanten = 99;
  let bestDanger = 10;

  const candidates = [...new Set(handIndices)];

  for (const tileIdx of candidates) {
    counts[tileIdx]--;
    const s = calcShanten([...counts]);
    counts[tileIdx]++;

    const danger = calcDanger(tileIdx, opponentDiscardIndices);
    const score = -(s * 10) - danger * 0.5;

    if (s < bestShanten || (s === bestShanten && score > bestScore)) {
      bestShanten = s;
      bestScore = score;
      bestDanger = danger;
      bestDiscardIdx = tileIdx;
    }
  }

  return {
    discard: bestDiscardIdx,
    shanten: bestShanten,
    danger: bestDanger,
    shantenBefore: currentShanten
  };
}

// ─────────────────────────────────────────────
// 工具：牌编码 ↔ 名称互转（使用face值）
// ─────────────────────────────────────────────

const TILE_NAMES = {
  // 万
  11: '1万', 12: '2万', 13: '3万', 14: '4万', 15: '5万', 16: '6万', 17: '7万', 18: '8万', 19: '9万',
  // 条
  21: '1条', 22: '2条', 23: '3条', 24: '4条', 25: '5条', 26: '6条', 27: '7条', 28: '8条', 29: '9条',
  // 筒
  31: '1筒', 32: '2筒', 33: '3筒', 34: '4筒', 35: '5筒', 36: '6筒', 37: '7筒', 38: '8筒', 39: '9筒',
  // 风
  41: '东', 42: '南', 43: '西', 44: '北',
  // 三元
  1: '中', 2: '发', 3: '白',
};

/**
 * face值 → 牌名
 * @param {number} face - GameService的face值（原始牌号 % 50）
 * @returns {string}
 */
function tileToName(face) {
  return TILE_NAMES[face] ?? `未知(${face})`;
}

/**
 * 牌名 → face值
 * @param {string[]} names - 牌名数组
 * @returns {number[]}
 */
function namesToFaces(names) {
  const nameToFace = {};
  for (const [face, name] of Object.entries(TILE_NAMES)) {
    nameToFace[name] = Number(face);
  }
  return names.map(n => {
    const face = nameToFace[n];
    if (face === undefined) throw new Error(`未知牌名: ${n}`);
    return face;
  });
}

// ─────────────────────────────────────────────
// 导出（Node.js / ES module 两用）
// ─────────────────────────────────────────────

const MahjongAI = {
  decide,
  shouldPong,
  calcShanten,
  calcDanger,
  tileToName,
  namesToFaces,
  // 映射工具（供需要时使用）
  FACE_TO_IDX,
  IDX_TO_FACE,
  facesToIndices,
  idxToFace,
};

if (typeof module !== 'undefined') module.exports = MahjongAI;
if (typeof window !== 'undefined') window.MahjongAI = MahjongAI;
