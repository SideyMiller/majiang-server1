/**
 * 房间相关controller
 * @author Kevin
 * @Date: 2024-6-18
 */
const Router = require('koa-router');
const SocketService = require("@/core/socket/SocketService");
const RoomService = require("@/core/services/RoomService");
const Validate = require("@/utils/vlidate");
const Errors = require("@/utils/api/errors");
const HttpStatus = require("@/utils/api/httpStatus");
const room = new Router();
const _ = require("lodash")
const GameControl = require("@/services/game/GameControl");

let ws = SocketService.getInstance();


/**
 * 创建房间
 */
room.post('/createRoom', async ctx =>{
	let { userId, roomType, customRoomId } = ctx.request.body;
	let response;
	if(!userId){
		response = Validate.checkSuccess("参数异常", Errors.INVALID_PARAM, HttpStatus.OK, {});
		ctx.body = response;
		return;
	}
	let roomInfo, gameInfo;
	try{
		const res = await RoomService.createRoom(userId, customRoomId, roomType);
		roomInfo = res?.roomInfo;
		gameInfo = res?.gameInfo;
		if (!_.isEmpty(roomInfo)) {
			ws.sendToUser(userId, `恭喜创建房间成功，房号${_.get(roomInfo, `${userId}.roomId`)}`, {roomInfo, gameInfo}, 'create');
		} else {
			ws.sendToUser(userId, `创建房间失败,请稍后重试`, roomInfo, 'create');
		}
	}catch(e){
		ws.sendToUser(userId,`创建房间失败,请稍后重试`,roomInfo, 'create');
	}
	response = Validate.checkSuccess("创建成功", Errors.SUCCESS, HttpStatus.OK, roomInfo);
	ctx.body = response;
})

/**
 * 加入房间
 */
room.post("/joinRoom", async ctx =>{
	let { roomId,userId } = ctx.request.body;
	let response;
	if(!userId){
		response = Validate.checkSuccess("参数异常", Errors.INVALID_PARAM, HttpStatus.OK, {});
		ctx.body = response;
		return;
	}
	let roomInfo, gameInfo;
	try{
		let res;
		if (roomId) {
            // 正常加入房间
            res = await RoomService.joinRoom(roomId, userId);
        } else {
            // 没传 roomId，走【快速匹配】逻辑，让 Service 自己去找空屋或者新建
            res = await RoomService.quickMatch(userId); 
        }
		roomInfo = res?.roomInfo;
		gameInfo = res?.gameInfo;
		for(let k in roomInfo){
			ws.sendToUser(_.get(roomInfo,`${k}.id`),`欢迎用户${userId}加入房间${roomId|| ''}`,{roomInfo, gameInfo},'join');
		}
		response = Validate.checkSuccess("加入成功", Errors.SUCCESS, HttpStatus.OK, roomInfo);
	}catch(e){
		response = Validate.checkSuccess(e, Errors.ROOM_NOT_EXIST, HttpStatus.OK, { customRoomId: roomId });
	}
	ctx.body = response;
});

/**
 * 玩家准备 / 取消准备
 */
room.post("/ready", async ctx => {
    let { roomId, playerId, status } = ctx.request.body; // status传1是准备，传0是取消
	
    try {
        // 1. 调用你找到的 setout 更新状态
        let roomInfo = await RoomService.setout(roomId, playerId, status);
		console.log(`当前房间数据:`, JSON.stringify(roomInfo, null, 2));
        // 2. 告诉房间所有人：有人准备了/取消了，赶紧刷新UI
        for(let k in roomInfo){
            ws.sendToUser(_.get(roomInfo, `${k}.id`), `状态更新`, {roomInfo}, 'updateRoom');
        }
        // 3. 开始检阅队伍（检查是否满足开局条件）
        let playerIds = Object.keys(roomInfo);
        let isFull = playerIds.length === 1 ; // 假设你的游戏是4人局
        let allReady = true;

        for (let id of playerIds) {
            if (roomInfo[id].status !== 1) { // 只要揪出一个没准备的
                allReady = false;
                break; // 停止检查
            }
        }
		console.log(`发车判定 -> 满员: ${isFull} (当前${playerIds.length}人), 全员准备: ${allReady}`);
        // 4. 终极发车！满员且全员准备！
        if (isFull && allReady) {
            // 调用你说的另外那个代码里的核心开始逻辑
            GameControl.startGame({ roomId: roomId }, ws); 


            
        }

        ctx.body = Validate.checkSuccess("操作成功", Errors.SUCCESS, HttpStatus.OK, roomInfo);
    } catch (e) {
        ctx.body = Validate.checkSuccess(e, Errors.FAILURE, HttpStatus.OK, {});
    }
});

/**
 * 退出房间
 */
room.post("/quitRoom", async ctx =>{
	let { roomId,userId } = ctx.request.body;
	let response;
	if(!userId){
		response = Validate.checkSuccess("参数异常", Errors.INVALID_PARAM, HttpStatus.OK, {});
		ctx.body = response;
		return;
	}
	let roomInfo, gameInfo;
	try{
		const res = await RoomService.quitRoom(roomId,userId);
		roomInfo = res?.roomInfo;
		gameInfo = res?.gameInfo;
		for(let k in roomInfo){
			ws.sendToUser(_.get(roomInfo,`${k}.id`),`用户${userId}已退出房间${roomId}`,roomInfo,'quit');
		}
		response = Validate.checkSuccess("退出成功", Errors.SUCCESS, HttpStatus.OK, roomInfo);
	}catch(e){
		response = Validate.checkSuccess(e, Errors.ROOM_NOT_EXIST, HttpStatus.OK, roomInfo);
	}
	ctx.body = response;
});

module.exports = room;
