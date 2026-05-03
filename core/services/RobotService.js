
const AI = require("@/core/services/mahjong-ai");

class FakeWebSocket {
    constructor(userId) {
        this.userId = userId;
        this.isAlive = true;
        this.readyState = 1;
        this.roomId = null;
        
    }

    // 拦截服务端发来的所有消息
    send(message) {
        try {
            const parsed = typeof message === 'string' ? JSON.parse(message) : message;
            this.think(parsed);
        } catch (e) {
            console.error("机器人解析消息异常", e);
        }
    }

    // 维持长连接心跳，防止被踢
    ping() { this.isAlive = true; }
    terminate() {}

    /**
     * 从 roomInfo 中收集其他三家的出牌历史（face值数组）
     * @param {object} roomInfo - 房间信息
     * @returns {number[][]} - 三家出牌历史（face值）
     */
    collectOpponentDiscards(roomInfo) {
        const _ = require("lodash");
        const discards = [];
        for (const pid in roomInfo) {
            if (pid === this.userId) continue;
            const played = _.get(roomInfo, `${pid}.playedCards`, []);
            // 转为 face 值（%50），过滤花牌
            discards.push(played.filter(c => !(c >= 211 && c <= 218)).map(c => c % 50));
        }
        return discards;
    }

    /**
     * 从 roomInfo 中获取自己的手牌（face值数组，已过滤花牌）
     * @param {object} roomInfo - 房间信息
     * @returns {number[]}
     */
    getMyHandFaces(roomInfo) {
        const _ = require("lodash");
        const handCards = _.get(roomInfo, `${this.userId}.handCards`, []);
        
                    
        return handCards.filter(c => !(c >= 211 && c <= 218)).map(c => c % 50);
    }

    /**
     * 根据 AI 建议的 face 值，从手牌中找到对应的原始牌号
     * @param {object} roomInfo - 房间信息
     * @param {number} face - AI建议出的牌的face值
     * @returns {number} - 原始牌号
     */
    findOriginalCard(roomInfo, face) {
        const _ = require("lodash");
        const handCards = _.get(roomInfo, `${this.userId}.handCards`, []);
        // 优先找非花牌中匹配face值的牌
        const found = handCards.find(c => !(c >= 211 && c <= 218) && c % 50 === face);
        return found || handCards[handCards.length - 1]; // 兜底：打最后一张
    }
    
    // AI 大脑：收到消息后决定做什么
    think(messageObj) {
        const { type, data } = messageObj;
        
        if (data && data.roomInfo && data.roomInfo[this.userId] && data.roomInfo[this.userId].roomId) {
            this.roomId = data.roomInfo[this.userId].roomId;
        }

        if (type === 'deliverCard' && data.playerId === this.userId) {
            setTimeout(() => {
                try {
                    const RoomService = require("@/core/services/RoomService");
                    const roomInfo = RoomService.getRoomInfo(data.roomInfo[this.userId].roomId); // ← 取最新
                    const handFaces = this.getMyHandFaces(roomInfo);
                    const discards = this.collectOpponentDiscards(roomInfo);
                    const decision = AI.decide(handFaces, discards);
                    const cardNum = this.findOriginalCard(roomInfo, decision.discard);
                    console.log(`机器人 [${this.userId}] AI决策: ${decision.reason}`);
                    this.mockClientAction('playCard', {
                        roomId: data.roomInfo[this.userId].roomId,
                        userId: this.userId,
                        cardNum
                    });
                } catch (e) {
                    console.error(`机器人 [${this.userId}] AI出牌决策异常，兜底出牌`, e);
                    const RoomService = require("@/core/services/RoomService");
                    const roomInfo = RoomService.getRoomInfo(data.roomInfo[this.userId].roomId);
                    const handCards = _.get(roomInfo, `${this.userId}.handCards`, []);
                    
                    this.mockClientAction('playCard', {
                        roomId: data.roomInfo[this.userId].roomId,
                        userId: this.userId,
                        cardNum: handCards[handCards.length - 1]
                    });
                }
            }, 1000 + Math.random() * 1500);
        }

        else if (type === 'operate' && data.playerId === this.userId) {
            clearTimeout(this._pendingPlay);
            this._pendingPlay = null;

            
                if (data.operateType === 2) {
                    try {
                        const roomInfo = data.roomInfo;
                        const handFaces = this.getMyHandFaces(roomInfo);
                        const tileFace = data.cardNum % 50;
                        const shouldPong = AI.shouldPong(handFaces, tileFace);
                        if (!shouldPong) {
                            this.mockClientAction('pass', {
                                roomId: data.roomInfo[this.userId].roomId,
                                userId: this.userId,
                            });
                            return;
                        }
                    } catch (e) {
                        console.error(`机器人 [${this.userId}] AI碰牌决策异常，默认碰`, e);
                    }
                    this.mockClientAction('peng', {
                        roomId: data.roomInfo[this.userId].roomId,
                        userId: this.userId,
                        cardNum: data.cardNum
                    });
                    setTimeout(() => {
                        try {
                            const RoomService = require("@/core/services/RoomService");
                            const roomInfo = RoomService.getRoomInfo(data.roomInfo[this.userId].roomId);
                            const handFaces = this.getMyHandFaces(roomInfo);
                            const discards = this.collectOpponentDiscards(roomInfo);
                            const decision = AI.decide(handFaces, discards);
                            const cardNum = this.findOriginalCard(roomInfo, decision.discard);
                            this.mockClientAction('playCard', {
                                roomId: data.roomInfo[this.userId].roomId,
                                userId: this.userId,
                                cardNum
                            });
                        } catch (e) {
                            const RoomService = require("@/core/services/RoomService");
                            const roomInfo = RoomService.getRoomInfo(data.roomInfo[this.userId].roomId);
                            const handCards = _.get(roomInfo, `${this.userId}.handCards`, []);
                            this.mockClientAction('playCard', {
                                roomId: data.roomInfo[this.userId].roomId,
                                userId: this.userId,
                                cardNum: handCards[handCards.length - 1]
                            });
                        }
                    }, 800);
                    return; // ← 加return
                }
                if (data.operateType === 3) {
                    this.mockClientAction('gang', {
                        roomId: data.roomInfo[this.userId].roomId,
                        userId: this.userId,
                        type: 'minggang',
                        cardNum: data.cardNum
                    });
                    return; // ← 加return
                }
                if (data.operateType === 4) {
                    this.mockClientAction('win', {
                        roomId: data.roomInfo[this.userId].roomId,
                        userId: this.userId,
                        cardNum: data.gameInfo.activeCardNum
                    });
                    return;
                }
                if (data.operateType === 5) {
                    this.mockClientAction('gang', {
                        roomId: data.roomInfo[this.userId].roomId,
                        userId: this.userId,
                        type: 'bugang',
                        cardNum: data.cardNum
                    });
                    return;
                }
                if (data.operateType === 6) {
                    this.mockClientAction('gang', {
                        roomId: data.roomInfo[this.userId].roomId,
                        userId: this.userId,
                        type: 'angang',
                        cardNum: data.cardNum
                    });
                    return;
                }
                if (data.operateType === 7) {
                    this.mockClientAction('gang', {
                        roomId: data.roomInfo[this.userId].roomId,
                        userId: this.userId,
                        type: 'huagang',
                        cardNum: data.cardNum
                    });
                    return;
                }
            
        }

        else if (type === 'winning' || type === 'flow') {
            setTimeout(() => {
                const roomId = this.roomId;
                const RoomService = require("@/core/services/RoomService");
                const RobotService = require("@/core/services/RobotService");
                const SocketService = require("@/core/socket/SocketService");
                const newRoomInfo = RoomService.setout(roomId, this.userId, 1);
                if (newRoomInfo) {
                    const ws = SocketService.getInstance();
                    for (let k in newRoomInfo) {
                        ws.sendToUser(newRoomInfo[k].id, `状态更新`, { roomInfo: newRoomInfo }, 'updateRoom');
                    }
                    RobotService.checkAndStartGame(roomId);
                }
            }, 2000);
        }
    }

    // 伪造真实网络包，直接灌入 GameControl
    mockClientAction(actionType, actionData) {
        const GameControl = require("@/services/game/GameControl");
        const SocketService = require("@/core/socket/SocketService");
        const fakeMessage = { type: actionType, data: actionData };
        if (typeof GameControl[actionType] === 'function') {
            GameControl[actionType](fakeMessage, SocketService.getInstance());
        }
    }
}

const RobotService = {
    /**
     * 辅助方法：延迟等待
     * @param {number} ms 毫秒
     */
    sleep: function (ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },


    /**
     * 添加机器人到房间
     * @param {string} roomId - 房间ID
     * @param {number} count - 要添加的机器人数量
     */
    addRobots: async function(roomId, count) {
        // 动态引入 RoomService，解决与 RoomService 的相互依赖死锁问题
        const RoomService = require("@/core/services/RoomService");
        const SocketService = require("@/core/socket/SocketService");
        
        
        for (let i = 0; i < count; i++) {
            // 1. 模拟人类操作延迟
            // 第一个机器人快一点(0.5秒)，后面的随机等 1~2.5秒
            let delayMs = (i === 0) ? 500 : (1000 + Math.random() * 1500);
            await this.sleep(delayMs);

            // 2. 生成机器人的虚拟 ID (使用特定前缀方便识别)
            let robotId = `robot_${Date.now()}_${i}`;
            
            

            try {
                // 3. 调用 RoomService.joinRoom，按照您的指示传入第三个参数 'ai'
                // 注意：在您下一步修改 RoomService 之前，这里执行会报错抛出异常（这是预期的）
                const res = await RoomService.joinRoom(roomId, robotId, 'ai');
                await RoomService.setout(roomId, robotId, 1);
                this.createRobotSocket(robotId);
                
                const ws = SocketService.getInstance();
                for(let k in res.roomInfo){
                    ws.sendToUser(res.roomInfo[k].id, `欢迎 AI 加入房间`, {roomInfo: res.roomInfo, gameInfo: res.gameInfo}, 'join');
                    // 同步更新房间状态
                    ws.sendToUser(res.roomInfo[k].id, `状态更新`, {roomInfo: res.roomInfo}, 'updateRoom');
                }
                this.checkAndStartGame(roomId);
                
            } catch (error) {
                console.error(`机器人 [${robotId}] 加入房间失败:`, error);
            }
        }
        
        // console.log(`房间 ${roomId} 的 ${count} 个机器人添加流程结束。`);
    },

    createRobotSocket: function(robotId) {
        const SocketService = require("@/core/socket/SocketService");
        const wsServer = SocketService.getInstance();
        if (wsServer && wsServer.client) {
            const fakeSocket = new FakeWebSocket(robotId);
            fakeSocket.userId = robotId;
            wsServer.client.clients.add(fakeSocket); // 核心：瞒天过海！
        }
    },

    // 【新增】打扫战场
    removeRobotSocket: function(robotId) {
        const SocketService = require("@/core/socket/SocketService");
        const wsServer = SocketService.getInstance();
        if (wsServer && wsServer.client) {
            wsServer.client.clients.forEach(ws => {
                
                if (ws.userId === robotId) {
                    wsServer.client.clients.delete(ws);
                }
                setTimeout(() => {
                    const PlayerService = require("@/core/services/PlayerService");
                    PlayerService.cleanUserStatus(robotId);
                    console.log(robotId + "的状态已清空");
                    
                
                }, 800);
            });
        }
        
    },

    // 【新增】机器人加入后触发发车检测
    checkAndStartGame: function(roomId) {
        const RoomService = require("@/core/services/RoomService");
        const SocketService = require("@/core/socket/SocketService");
        const roomInfo = RoomService.getRoomInfo(roomId);
        let playerIds = Object.keys(roomInfo);
        let isFull = playerIds.length === 4; // 发车条件：4人
        let allReady = true;

        for (let id of playerIds) {
            if (roomInfo[id].status !== 1) { 
                allReady = false;
                break;
            }
        }
        
        if (isFull && allReady) {
            const GameControl = require("@/services/game/GameControl");
            GameControl.startGame({ roomId: roomId }, SocketService.getInstance()); 
        }
    }
};

module.exports = RobotService;
