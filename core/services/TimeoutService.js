/**
 * 超时服务 - 防止玩家挂机/断网/划走app导致游戏卡住
 * 当玩家在规定时间内未操作时，自动使用AI代打
 * 
 * 工作模式：
 *   1. 每次 sendToUser 发送 deliverCard/operate 时启动倒计时
 *   2. 收到客户端操作消息时取消倒计时
 *   3. 超时触发 → 标记该玩家为"托管模式"
 *   4. 托管模式下，后续所有 deliverCard/operate 直接由AI代打（不再等超时）
 *   5. 客户端 reconnect 时取消托管模式，恢复正常
 *   6. 游戏结束 win/flow 时清除所有状态
 * 
 * @author AI
 */

const AI = require("@/core/services/mahjong-ai");
const _ = require("lodash");

// 超时时间配置（毫秒）
const TIMEOUT_CONFIG = {
    playCard: 16000,   // 出牌超时 15秒
    operate: 16000,     // 碰/杠/胡决策超时 8秒
};

// AI托管模式下的操作延迟（毫秒），模拟思考时间
const AUTO_PLAY_DELAY = 800;

const TimeoutService = {
    // 存储每个玩家的超时定时器 { playerId: { timer, roomId, type, data } }
    _timers: {},

    // 存储处于托管模式的玩家 { playerId: roomId }
    _autoPlayPlayers: {},

    /**
     * 判断是否为机器人（机器人不需要超时机制）
     * @param {string} playerId
     * @returns {boolean}
     */
    isRobot(playerId) {
        return playerId && playerId.startsWith('robot_');
    },

    /**
     * 判断玩家是否处于托管模式
     * @param {string} playerId
     * @returns {boolean}
     */
    isAutoPlay(playerId) {
        return !!this._autoPlayPlayers[playerId];
    },

    /**
     * 启动超时定时器
     * 如果玩家已在托管模式，跳过定时器，直接触发AI代打
     * @param {string} roomId - 房间ID
     * @param {string} playerId - 玩家ID
     * @param {string} type - 操作类型: 'playCard' | 'operate'
     * @param {object} data - 上下文数据（roomInfo, gameInfo, operateType, cardNum 等）
     */
    startTimeout(roomId, playerId, type, data) {
        // 机器人不需要超时
        if (this.isRobot(playerId)) return;

        // 已在托管模式 → 直接AI代打，不走定时器
        if (this.isAutoPlay(playerId)) {
            console.log(`⏰ 玩家 [${playerId}] 已在托管模式，直接AI代打(${type})`);
            setTimeout(() => {
                this._handleAutoPlay(roomId, playerId, type, data);
            }, AUTO_PLAY_DELAY);
            return;
        }

        // 先清除该玩家之前的定时器（防止重复）
        this.cancelTimeout(playerId);

        const timeoutMs = TIMEOUT_CONFIG[type] || TIMEOUT_CONFIG.playCard;

        const timer = setTimeout(() => {
            console.log(`⏰ 玩家 [${playerId}] 操作超时(${type})，标记为托管模式`);
            delete this._timers[playerId];
            // 标记为托管模式
            this._autoPlayPlayers[playerId] = roomId;
            // 执行AI代打
            this._handleAutoPlay(roomId, playerId, type, data);
        }, timeoutMs);

        this._timers[playerId] = { timer, roomId, type, data };
    },

    /**
     * 取消玩家的超时定时器（玩家正常操作时调用）
     * @param {string} playerId
     */
    cancelTimeout(playerId) {
        if (this._timers[playerId]) {
            clearTimeout(this._timers[playerId].timer);
            delete this._timers[playerId];
        }
    },

    /**
     * 取消玩家的托管模式（reconnect时调用）
     * @param {string} playerId
     */
    cancelAutoPlay(playerId) {
        if (this._autoPlayPlayers[playerId]) {
            console.log(`⏰ 玩家 [${playerId}] 重连，取消托管模式`);
            delete this._autoPlayPlayers[playerId];
        }
        // 同时取消可能残留的定时器
        this.cancelTimeout(playerId);
    },

    /**
     * 取消房间内所有玩家的超时定时器和托管模式（游戏结束时调用）
     * @param {string} roomId
     */
    cancelAllByRoom(roomId) {
        // 清理定时器
        for (const playerId in this._timers) {
            if (this._timers[playerId].roomId === roomId) {
                clearTimeout(this._timers[playerId].timer);
                delete this._timers[playerId];
            }
        }
        // 清理托管模式
        for (const playerId in this._autoPlayPlayers) {
            if (this._autoPlayPlayers[playerId] === roomId) {
                delete this._autoPlayPlayers[playerId];
            }
        }
    },

    /**
     * 托管模式下的AI自动操作入口
     * @param {string} roomId
     * @param {string} playerId
     * @param {string} type - 'playCard' | 'operate'
     * @param {object} data - 上下文数据
     */
    _handleAutoPlay(roomId, playerId, type, data) {
        try {
            const RoomService = require("@/core/services/RoomService");

            // 获取最新的房间信息
            const roomInfo = RoomService.getRoomInfo(roomId);
            if (!roomInfo || !roomInfo[playerId]) {
                console.log(`⏰ 玩家 [${playerId}] 已不在房间，跳过AI代打`);
                return;
            }

            if (type === 'playCard') {
                this._autoPlayCard(roomId, playerId, roomInfo);
            } else if (type === 'operate') {
                this._autoOperate(roomId, playerId, data, roomInfo);
            }
        } catch (e) {
            console.error(`⏰ 玩家 [${playerId}] AI代打异常:`, e);
            // 兜底
            if (type === 'playCard') {
                this._fallbackPlayCard(roomId, playerId);
            } else if (type === 'operate') {
                this._fallbackPass(roomId, playerId);
            }
        }
    },

    /**
     * AI自动出牌（复用RobotService的AI决策逻辑）
     */
    _autoPlayCard(roomId, playerId, roomInfo) {
        const GameControl = require("@/services/game/GameControl");
        const SocketService = require("@/core/socket/SocketService");

        const handCards = _.get(roomInfo, `${playerId}.handCards`, []);
        // 过滤花牌，转face值
        const handFaces = handCards.filter(c => !(c >= 211 && c <= 218)).map(c => c % 50);
        
        // 收集其他三家的出牌历史
        const discards = [];
        for (const pid in roomInfo) {
            if (pid === playerId) continue;
            const played = _.get(roomInfo, `${pid}.playedCards`, []);
            discards.push(played.filter(c => !(c >= 211 && c <= 218)).map(c => c % 50));
        }

        let cardNum;
        try {
            const decision = AI.decide(handFaces, discards);
            // 根据AI建议的face值找到原始牌号
            cardNum = handCards.find(c => !(c >= 211 && c <= 218) && c % 50 === decision.discard)
                    || handCards[handCards.length - 1];
            console.log(`⏰ 玩家 [${playerId}] AI出牌决策: face=${decision.discard}, 原因: ${decision.reason}`);
        } catch (e) {
            console.error(`⏰ 玩家 [${playerId}] AI出牌决策异常，兜底出牌`, e);
            cardNum = handCards[handCards.length - 1];
        }

        const fakeMessage = {
            type: 'playCard',
            data: { roomId, userId: playerId, cardNum }
        };
        GameControl.playCard(fakeMessage, SocketService.getInstance());
    },

    /**
     * AI自动操作（碰/杠/胡/pass）
     */
    _autoOperate(roomId, playerId, data, roomInfo) {
        const GameControl = require("@/services/game/GameControl");
        const SocketService = require("@/core/socket/SocketService");
        const RoomService = require("@/core/services/RoomService");

        const operateType = data?.operateType;
        const cardNum = data?.cardNum;

        if (operateType === 2) {
            // 碰牌：用AI判断是否碰
            try {
                const handFaces = _.get(roomInfo, `${playerId}.handCards`, [])
                    .filter(c => !(c >= 211 && c <= 218))
                    .map(c => c % 50);
                const tileFace = cardNum % 50;
                const shouldPong = AI.shouldPong(handFaces, tileFace);

                if (!shouldPong) {
                    console.log(`⏰ 玩家 [${playerId}] AI决定不碰，自动pass`);
                    this._fallbackPass(roomId, playerId);
                    return;
                }
            } catch (e) {
                console.error(`⏰ 玩家 [${playerId}] AI碰牌决策异常，默认碰`, e);
            }

            console.log(`⏰ 玩家 [${playerId}] AI自动碰牌`);
            const fakeMessage = {
                type: 'peng',
                data: { roomId, userId: playerId, cardNum }
            };
            GameControl.peng(fakeMessage, SocketService.getInstance());

            // 碰完后需要出牌，延迟一下再用AI决定打哪张
            setTimeout(() => {
                try {
                    const latestRoomInfo = RoomService.getRoomInfo(roomId);
                    this._autoPlayCard(roomId, playerId, latestRoomInfo);
                } catch (e) {
                    console.error(`⏰ 玩家 [${playerId}] 碰后AI出牌异常`, e);
                    this._fallbackPlayCard(roomId, playerId);
                }
            }, 500);

        } else if (operateType === 3 || operateType === 5 || operateType === 6 || operateType === 7) {
            // 杠牌（明杠/补杠/暗杠/花杠）：遇到能杠就杠
            let gangType;
            if (operateType === 3) gangType = 'minggang';
            else if (operateType === 5) gangType = 'bugang';
            else if (operateType === 6) gangType = 'angang';
            else if (operateType === 7) gangType = 'huagang';

            console.log(`⏰ 玩家 [${playerId}] AI自动${gangType}`);
            const fakeMessage = {
                type: 'gang',
                data: { roomId, userId: playerId, cardNum, type: gangType }
            };
            GameControl.gang(fakeMessage, SocketService.getInstance());

        } else if (operateType === 4) {
            // 胡牌：遇到能胡就胡
            // cardNum 有值 = 点炮胡（胡别人的牌），cardNum 无值 = 自摸胡
            console.log(`⏰ 玩家 [${playerId}] AI自动胡牌`);
            const fakeMessage = {
                type: 'win',
                data: { roomId, userId: playerId, cardNum: cardNum || undefined }
            };
            GameControl.win(fakeMessage, SocketService.getInstance());

        } else {
            // 其他情况：pass
            console.log(`⏰ 玩家 [${playerId}] AI自动pass`);
            this._fallbackPass(roomId, playerId);
        }
    },

    /**
     * 兜底出牌：打最后一张
     */
    _fallbackPlayCard(roomId, playerId) {
        try {
            const GameControl = require("@/services/game/GameControl");
            const SocketService = require("@/core/socket/SocketService");
            const RoomService = require("@/core/services/RoomService");
            const roomInfo = RoomService.getRoomInfo(roomId);
            const handCards = _.get(roomInfo, `${playerId}.handCards`, []);
            const cardNum = handCards[handCards.length - 1];
            if (cardNum != null) {
                const fakeMessage = {
                    type: 'playCard',
                    data: { roomId, userId: playerId, cardNum }
                };
                GameControl.playCard(fakeMessage, SocketService.getInstance());
            }
        } catch (e) {
            console.error(`⏰ 玩家 [${playerId}] 兜底出牌也失败了:`, e);
        }
    },

    /**
     * 兜底操作：pass
     */
    _fallbackPass(roomId, playerId) {
        try {
            const GameControl = require("@/services/game/GameControl");
            const SocketService = require("@/core/socket/SocketService");
            const fakeMessage = {
                type: 'pass',
                data: { roomId, userId: playerId }
            };
            GameControl.pass(fakeMessage, SocketService.getInstance());
        } catch (e) {
            console.error(`⏰ 玩家 [${playerId}] 兜底pass也失败了:`, e);
        }
    }
};

module.exports = TimeoutService;
