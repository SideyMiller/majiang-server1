
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

    // AI 大脑：收到消息后决定做什么
    think(messageObj) {
        const { type, data } = messageObj;
        if (data && data.roomInfo && data.roomInfo[this.userId] && data.roomInfo[this.userId].roomId) {
            this.roomId = data.roomInfo[this.userId].roomId;
        }
        // 如果轮到自己摸牌了
        if (type === 'deliverCard' && data.playerId === this.userId) {
            // console.log(`机器人 [${this.userId}] 摸到牌 ${data.cardNum}，正在思考出牌...`);
            setTimeout(() => {
                this.mockClientAction('playCard', {
                    roomId: data.roomInfo[this.userId].roomId,
                    userId: this.userId,
                    cardNum: data.cardNum // 傻瓜AI：摸什么打什么。你可以后续优化这里的取牌逻辑
                });
            }, 1000 + Math.random() * 1000); // 随机等 1~2 秒
        }
        // 如果服务器提示可以操作（胡、杠、碰）
        else if (type === 'operate' && data.playerId === this.userId) {
            // console.log(`机器人 [${this.userId}] 收到操作提示: 操作码 ${data.operateType}`);
            setTimeout(() => {
                if (data.operateType === 2) { // 遇到能碰就一定碰
                    
                    this.mockClientAction('peng', {
                        roomId: data.roomInfo[this.userId].roomId,
                        userId: this.userId,
                        cardNum: data.cardNum
                    });
                    setTimeout(() => {
                        const _ = require("lodash")
                        const HandCards = _.get(data.roomInfo, `${this.userId}.handCards`);

                        this.mockClientAction('playCard', {
                            roomId: data.roomInfo[this.userId].roomId,
                            userId: this.userId,
                            cardNum: HandCards[HandCards.length - 1] // 傻瓜AI：摸什么打什么。你可以后续优化这里的取牌逻辑
                        });
                    }, 800);
                }
                if (data.operateType === 3) { // 遇到能杠就一定杠
                    
                    this.mockClientAction('gang', {
                        roomId: data.roomInfo[this.userId].roomId,
                        userId: this.userId,
                        type:'minggang',
                        cardNum: data.cardNum
                    });
                }
                if (data.operateType === 4) { // 遇到能胡就一定胡
                    this.mockClientAction('win', {
                        roomId: data.roomInfo[this.userId].roomId,
                        userId: this.userId,
                        cardNum: data.gameInfo.activeCardNum 
                    });
                }
                if (data.operateType === 5) { // 遇到能杠就一定杠
                    
                    this.mockClientAction('gang', {
                        roomId: data.roomInfo[this.userId].roomId,
                        userId: this.userId,
                        type:'bugang',
                        cardNum: data.cardNum
                    });
                }
                if (data.operateType === 6) { // 遇到能杠就一定杠
                    
                    this.mockClientAction('gang', {
                        roomId: data.roomInfo[this.userId].roomId,
                        userId: this.userId,
                        type:'angang',
                        cardNum: data.cardNum
                    });
                }
                if (data.operateType === 7) { // huagang ← 新增
                    this.mockClientAction('gang', {
                        roomId: data.roomInfo[this.userId].roomId,
                        userId: this.userId,
                        type:'huagang',
                        cardNum: data.cardNum
                    });
                }                     
            }, 1000);
        }
        else if (type === 'winning' || type === 'flow') {
            // console.log(`机器人 [${this.userId}] 检测到游戏结束，准备进入下一局...`);
            // 获取房间ID，因为此时 data.roomInfo 是最新的，可以直接用
            setTimeout(() => {   
                const roomId = this.roomId;
                const RoomService = require("@/core/services/RoomService");
                const RobotService = require("@/core/services/RobotService"); // 引入自身以调用静态方法
                const SocketService = require("@/core/socket/SocketService");
                const newRoomInfo = RoomService.setout(roomId, this.userId, 1); 
                if (newRoomInfo) { 
                    // 3. 获取socket实例并向房间里的【所有人】广播最新状态
                    const ws = SocketService.getInstance();
                    for(let k in newRoomInfo){
                        ws.sendToUser(newRoomInfo[k].id, `状态更新`, {roomInfo: newRoomInfo}, 'updateRoom');
                    }
                    // console.log(`机器人 [${this.userId}] 已广播自己的准备状态。`);

                    // 4. 调用检查开局的逻辑
                    // 注意：这里不能用 this.checkAndStartGame，因为 this 是 FakeWebSocket 实例
                    RobotService.checkAndStartGame(roomId);
                }
                
                // console.log(`机器人 [${this.userId}] 已自动准备！`);
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
