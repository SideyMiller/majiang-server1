/**
 * 国标麻将 AI - HTTP 服务端
 * 启动: node mahjong-ai-server.js
 * 默认端口: 3721
 */

const http = require('http');
const AI = require('./mahjong-ai');

const PORT = process.env.MAHJONG_AI_PORT || 3721;

function respond(res, code, data) {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

function createServer() {
  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') { respond(res, 200, {}); return; }
    if (req.method !== 'POST') { respond(res, 405, { error: 'POST only' }); return; }

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);

        // ── /decide: 决定打哪张牌 ──────────────────────
        if (req.url === '/decide') {
          /**
           * 请求体:
           * {
           *   hand: [11,12,13,...],        // 当前手牌（14张），face值（原始牌号%50）
           *   discards: [[],[],[]]         // 三家出牌历史（face值，可选）
           * }
           */
          const { hand, discards = [[], [], []] } = payload;
          if (!Array.isArray(hand) || hand.length !== 14)
            return respond(res, 400, { error: 'hand must be array of 14 tile face IDs' });

          const result = AI.decide(hand, discards);
          return respond(res, 200, {
            discard: result.discard,
            discardName: AI.tileToName(result.discard),
            shanten: result.shanten,
            shantenBefore: result.shantenBefore,
            danger: result.danger,
            reason: result.reason,
          });
        }

        // ── /pong: 是否碰牌 ──────────────────────────
        if (req.url === '/pong') {
          /**
           * { hand: [...13张...], tile: 11 }  // face值
           */
          const { hand, tile } = payload;
          const should = AI.shouldPong(hand, tile);
          return respond(res, 200, {
            pong: should,
            reason: should
              ? `碰【${AI.tileToName(tile)}】可以推进向听`
              : `不碰【${AI.tileToName(tile)}】，当前方向更优`
          });
        }

        // ── /shanten: 纯计算向听数 ──────────────────
        if (req.url === '/shanten') {
          const { hand } = payload;
          // hand 为 face 值数组，转为内部索引计算
          const indices = AI.facesToIndices(hand);
          const counts = new Array(34).fill(0);
          indices.forEach(t => counts[t]++);
          const s = AI.calcShanten(counts);
          return respond(res, 200, { shanten: s });
        }

        // ── /tiles: 牌名查询工具 ─────────────────────
        if (req.url === '/tiles') {
          // 返回 face 值对照表
          const table = Object.entries(AI.FACE_TO_IDX).map(([face, idx]) => ({
            face: Number(face),
            idx,
            name: AI.tileToName(Number(face))
          }));
          return respond(res, 200, { tiles: table });
        }

        respond(res, 404, { error: 'unknown endpoint' });
      } catch (e) {
        respond(res, 400, { error: e.message });
      }
    });
  });
  return server;
}

/**
 * 启动麻将AI服务
 * @param {number} [port] - 可选端口号，默认使用环境变量 MAHJONG_AI_PORT 或 3721
 * @returns {Promise<http.Server>} 返回服务器实例
 */
function startServer(port) {
  const serverPort = port || PORT;
  const server = createServer();
  
  return new Promise((resolve, reject) => {
    server.listen(serverPort, () => {
      console.log(`🀄 麻将AI服务已启动: http://localhost:${serverPort}`);
      console.log('接口列表:');
      console.log('  POST /decide  → 决定打哪张牌');
      console.log('  POST /pong    → 是否碰牌');
      // console.log('  POST /chow    → 是否吃牌');
      console.log('  POST /shanten → 计算向听数');
      console.log('  POST /tiles   → 牌编码对照表');
      resolve(server);
    });
    
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`端口 ${serverPort} 已被占用`);
      }
      reject(err);
    });
  });
}

// 如果直接运行此文件，则自动启动服务
if (require.main === module) {
  startServer().catch(console.error);
}

module.exports = { startServer, createServer };
