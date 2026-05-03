/**
 * @author Kevin
 * @Date: 2024-6-20
 */
const _ = require("lodash")
const RoomService = require("@/core/services/RoomService");
const PlayerService = require("@/core/services/PlayerService");
const moment = require("moment")

const GameService = {
	cards: [
		11,12,13,14,15,16,17,18,19,//万
		21,22,23,24,25,26,27,28,29,//条
		31,32,33,34,35,36,37,38,39,//筒

		61,62,63,64,65,66,67,68,69,//万
		71,72,73,74,75,76,77,78,79,//条
		81,82,83,84,85,86,87,88,89,//筒

		111,112,113,114,115,116,117,118,119,//万
		121,122,123,124,125,126,127,128,129,//条
		131,132,133,134,135,136,137,138,139,//筒

		161,162,163,164,165,166,167,168,169,//万
		171,172,173,174,175,176,177,178,179,//条
		181,182,183,184,185,186,187,188,189,//筒

		// 风牌 东南西北 × 4副
		41,42,43,44,     // 第1副
		91,92,93,94,     // 第2副
		141,142,143,144, // 第3副
		191,192,193,194, // 第4副

		// 三元 中发白 × 4副
		51,52,53,        // 第1副
		101,102,103,     // 第2副
		151,152,153,     // 第3副
		201,202,203,     // 第4副

		// 季节 春夏秋冬 × 1套（花牌不重复）
		211,212,213,214,215,216,217,218 // 春夏秋冬梅兰菊竹

		
	],
	gameCards:[],
	initCardIdx: 52,
	gangScore: 10,
	winScore: 10,
	/**
	 * 初始化游戏服务
	 * @param roomId
	 */
	init: function (roomId){

	},
	/**
	 * 洗牌算法
	 * @returns {*}
	 */
	shuffle:function (){
		let arr = _.cloneDeep(this.cards);
		for(let i=0;i<arr.length;i++){
			let idx = Math.floor(Math.random() * arr.length);
			let t = arr[idx];
			arr[idx] = arr[i];
			arr[i] = t;
		}
		return arr;
	},
	/**
	 * 开始游戏
	 */
	startGame: function (roomId) {
		let roomInfo = RoomService.getRoomInfo(roomId);
		this.gameCards = _.cloneDeep(this.shuffle());

		//生成游戏开始数据
		let idx = 0;
		let roomGameInfo;
		for (let key in roomInfo) {
			let data = {};
			data.startTime = moment().valueOf();
			data.status = 2;
			data.handCards = this.getHandCards(this.gameCards, idx);
			data.playedCards = [];
			roomGameInfo = this.updateRoomInfo(key, roomInfo, _.assign({},roomInfo[key],data))
			idx++;
			// 更新房间全部玩家状态，状态改为游戏中
			PlayerService.updatePlayerInfoDeep("playerStatus", key, 3)
		}
		// 更新房间数据
		this.updateRooms(roomId, roomGameInfo);
		// 开始游戏，并发完手牌后，下一张牌的索引为52
		this.initGames(roomId, this.initCardIdx, this.gameCards);
		return RoomService.getRoomInfo(roomId);
	},
	/**
	 *  获取手牌数据
	 */
	getHandCards: function (cards, idx) {
		
		let handCards = idx === 0 ? cards.slice(0, 14) : idx === 1 ? cards.slice(14, 27) : idx === 2 ? cards.slice(27, 40) : idx === 3 ? cards.slice(40, 53) : [];
		return this.adjustHandCards(handCards);
	},
	/**
	 * 整理手牌(万、条、索合并并排序)
	 */
	adjustHandCards: function (cards){
		if (!cards || cards.length === 0) return [];
		let adjustCards = _.cloneDeep(cards);

		function sortKey(num) {
			if (num >= 211) return num - 211;          // 花牌 排最前 0~13
			const mod = num % 50;
			if (mod >= 11 && mod <= 19) return 200 + mod;  // 万
			if (mod >= 21 && mod <= 29) return 300 + mod;  // 条
			if (mod >= 31 && mod <= 39) return 400 + mod;  // 筒
			if (mod >= 41 && mod <= 44) return 500 + mod;  // 风
			if (mod >= 1  && mod <= 3)  return 100 + mod;  // 三元
			return 999;
		}

		adjustCards.sort((a, b) => sortKey(a) - sortKey(b));
		return adjustCards;
	},
	/**
	 * 修改房间数据
	 */
	updateRoomInfo: function (playerId, roomInfo, data){
		return RoomService.updateRoomInfoShallow(playerId, roomInfo, data)
	},
	/**
	 * 修改服务器所有房间数据源中某个房间数据
	 * @param roomId
	 * @param roomInfo
	 */
	updateRooms: function (roomId, roomInfo) {
		let oldRooms = _.get(RoomService, `rooms`);
		RoomService.updateRoomInfo(roomId, oldRooms, roomInfo)
	},
	/**
	 * 修改服务器保存的所有房间的游戏数据
	 */
	initGames: function (roomId, activeCardIdx, cards) {
		RoomService.initGameCollections(roomId, activeCardIdx, cards)
	},
	/**
	 * 某个玩家出牌
	 * @param roomId
	 * @param cardNum
	 * @param playerId
	 */
	playCard: function (roomId, cardNum, playerId){
		let oldRoomInfo = RoomService.getRoomInfo(roomId);
		let oldPlayedCards = _.get(oldRoomInfo, `${playerId}.playedCards`, []);
		let oldHandCards = _.get(oldRoomInfo, `${playerId}.handCards`, []);
		if(!_.includes(oldHandCards, cardNum)){
			cardNum = oldHandCards[oldHandCards.length - 1];
		}
		let allPlayedCards = RoomService.getGameInfoDeep(roomId, "allPlayedCards",  []);
		oldPlayedCards.push(cardNum);
		const newAllPlayedCards = _.uniq(allPlayedCards?.push(cardNum));
		let newHandCards = _.filter(oldHandCards, o=>o !== cardNum);
		let newRoomInfo = oldRoomInfo;
		RoomService.updateRoomInfoDeep("playedCards", playerId, oldRoomInfo, oldPlayedCards)
		RoomService.updateRoomInfoDeep("handCards", playerId, oldRoomInfo, newHandCards)
		// 更新对局游戏数据
		RoomService.updateGameCollectionsDeep(roomId, "optionPos", this.getNextPlayerPos(roomId, playerId))
		RoomService.updateGameCollectionsDeep(roomId, "optionTime", moment().valueOf())
		RoomService.updateGameCollectionsDeep(roomId, "activeCardNum", cardNum);
		RoomService.updateGameCollectionsDeep(roomId, "playCardPlayerId", playerId);
		RoomService.updateGameCollectionsDeep(roomId, "allPlayedCards", newAllPlayedCards)
		this.updateRooms(roomId, newRoomInfo)
		return RoomService.getRoomInfo(roomId);
	},
	/**
	 * 获取下一位出牌的玩家（同时其他玩家可以-抢碰、抢杠）
	 * @param roomId
	 * @param playerId
	 */
	getNextPlayerPos:function (roomId, playerId){
		const gameInfo = RoomService.getGameInfo(roomId);
		const roomInfo = RoomService.getRoomInfo(roomId);
		let optionPos = _.get(gameInfo, `optionPos`, 0);
		const playerCount = _.size(roomInfo) - 1;
		return _.toNumber(optionPos) + 1  > playerCount ? 0 : _.toNumber(optionPos) + 1;
	},
	/**
	 * 检测其他人打出的牌（主要是碰和杠）
	 */
	handleOtherPlayerCard: function (roomId, playerId, cardNum, pass){
		if(pass){
			// 从 pass 调用，跳过碰/杠/胡检测，直接让下家摸牌
			this.handleHandCardByMe(roomId, playerId);
			return;
		}
		// 正常出牌，检测其他玩家是否可操作
		const isAllPlayerHasOption = this.handleHandCardByOtherPlayerCard(roomId, playerId, cardNum);
		if(!isAllPlayerHasOption){
			// 无人可操作，让下家摸牌
			this.handleHandCardByMe(roomId, playerId);
		}
	},

	

	// 工具函数
	face: card => card % 50,

		isHonor: function(f) {
		return (f >= 41 && f <= 44) || (f >= 1 && f <= 3);
	},

	sameSuit: function(a, b, c) {
		const suit = f => f >= 11 && f <= 19 ? 1
						: f >= 21 && f <= 29 ? 2
						: f >= 31 && f <= 39 ? 3 : 0;
		return suit(a) === suit(b) && suit(b) === suit(c) && suit(a) !== 0;
	},

	// 递归验证面子
	checkSets: function(faces) {
		if (faces.length === 0) return true;
		const a = faces[0];

		if (faces[1] === a && faces[2] === a) {
			if (this.checkSets(faces.slice(3))) return true;
		}

		if (!this.isHonor(a)) {
			const b = a + 1, c = a + 2;
			if (this.sameSuit(a, b, c) && faces.includes(b) && faces.includes(c)) {
			const rest = [...faces];
			rest.splice(rest.indexOf(a), 1);
			rest.splice(rest.indexOf(b), 1);
			rest.splice(rest.indexOf(c), 1);
			if (this.checkSets(rest)) return true;
			}
		}
		return false;
	},

	// 七对
	checkSevenPairs: function(faces) {
		if (faces.length !== 14) return false;
		for (let i = 0; i < faces.length; i += 2) {
			if (faces[i] !== faces[i + 1]) return false;
		}
		return true;
		},

		// 十三幺
		checkThirteenOrphans: function(faces) {
		if (faces.length !== 14) return false;
		const required = [1, 2, 3, 11, 19, 21, 29, 31, 39, 41, 42, 43, 44];
		const counts = {};
		faces.forEach(f => counts[f] = (counts[f] || 0) + 1);
		const keys = Object.keys(counts).map(Number);
		if (keys.length !== 13) return false;
		return required.every(r => keys.includes(r));
	},

	// 主入口
	checkIsWinning: function(cards) {
		// 过滤花牌，转牌面值，排序
		const faces = cards
			.filter(c => !(c >= 211 && c <= 218))
			.map(c => c % 50)
			.sort((a, b) => a - b);

		if (this.checkSevenPairs(faces)) return true;
		if (this.checkThirteenOrphans(faces)) return true;

		if (faces.length % 3 !== 2) return false;

		for (let i = 0; i < faces.length - 1; i++) {
			if (faces[i] === faces[i + 1]) {
			if (i > 0 && faces[i] === faces[i - 1]) continue; // 跳过重复枚举
			const rest = [...faces];
			rest.splice(i, 2);
			if (this.checkSets(rest)) return true;
			}
		}
		return false;
	},

	/**
	 * 将原始卡牌 换算成用于计算的卡牌
	 * 原来的麻将牌通过50的倍数定义的（---->因为每个花色牌有4张相同的，计算时又不需要区分<----），计算时需要换算成便于计算的
	 * @param cards
	 */
	computedCards: function (cards) {
		return _.map(cards, o => (o >= 211 && o <= 218) ? o : o % 50);
	},


	/**
	 * 其他玩家出牌时检测手牌（主要是碰、杠、胡）
	 * @param roomId  房间id
	 * @param playerId  玩家id
	 * @param cardNum  检测的牌（别人打出或者自摸的牌）
	 */
	handleHandCardByOtherPlayerCard: function (roomId, playerId, cardNum){
		
		const SocketService = require("@/core/socket/SocketService");
		const ws = SocketService.getInstance();
		let roomInfo = RoomService.getRoomInfo(roomId);
		let gameInfo = RoomService.getGameInfo(roomId);
		const tableIds = gameInfo?.tableIds;
		let isAllPlayerHasOption = false;  // 其他玩家是否可以进行操作
		let firstOperateId = null;
		let operateType = null;
		let msg = "";
		_.map(tableIds, (otherPlayerId, idx)=>{
			let isPlayerOption = false
			if(otherPlayerId !== playerId){  // 非出牌人
				
				const handCards = _.get(roomInfo, `${otherPlayerId}.handCards`, []);
				const sameCard = _.size(_.filter(handCards, h => !(h >= 211 && h <= 218) && h % 50 === cardNum % 50));
				const cards = _.concat([], handCards, [cardNum]);
				
				// 判断是否胡牌
				const isWinning = this.checkIsWinning(cards)
				if(isWinning) { // 可以胡
					isAllPlayerHasOption = isPlayerOption = true;
					operateType = 4;
					msg = "可以胡牌";
				} else if(sameCard === 3){  //可以杠
					isAllPlayerHasOption = isPlayerOption = true;
					operateType = 3;
					msg = "可以杠牌";
				} else if(sameCard === 2){  //可以碰
					isAllPlayerHasOption = isPlayerOption = true;
					operateType = 2;
					msg = "可以碰牌";
				}
				if(isPlayerOption && !firstOperateId){ //如果是多个玩家可以操作（比如多人都可以碰杠胡），数据更新一次，且操作权限指向第一个可以操作的玩家
					RoomService.updateGameCollectionsDeep(roomId, "optionPos", idx)
					firstOperateId = otherPlayerId;
				}
				if(isPlayerOption){
					const gameInfo = RoomService.getGameInfo(roomId)
					const roomInfo = RoomService.getRoomInfo(roomId)
					ws.sendToUser(otherPlayerId, msg, {operateType, cardNum, playerId: otherPlayerId, gameInfo, roomInfo}, "operate");
				}
			}
		})
		if(isAllPlayerHasOption) {  // 告诉出牌人，其他玩家可以操作，指示灯轮转位置
			const gameInfo = RoomService.getGameInfo(roomId)
			const roomInfo = RoomService.getRoomInfo(roomId)
			ws.sendToUser(playerId, msg, {operateType, playerId: firstOperateId, gameInfo, roomInfo}, "operate");
		}
		
		return isAllPlayerHasOption;
	},
	/**
	 * 自摸牌时检测手牌（服务器下发的牌）
	 * 条件 -> 没有人能碰或者杠，则顺延的下家摸牌（服务端发一张牌给下家）
	 * @param roomId
	 * @param playerId
	 */
	handleHandCardByMe: function (roomId, playerId){
		
		const SocketService = require("@/core/socket/SocketService");
		const ws = SocketService.getInstance();
		let roomInfo = RoomService.getRoomInfo(roomId);
		let gameInfo = RoomService.getGameInfo(roomId);
		const tableIds = gameInfo?.tableIds || [];
		const keys = _.keys(roomInfo);
		const newCardNum = RoomService.getNextCard(roomId);
		
		if (typeof newCardNum !== "number" || _.toNumber(gameInfo?.activeCardIdx) >= _.toNumber(gameInfo?.lastActiveCardIdx)) { // 表示牌已摸完，流局
			this.flow(roomId, playerId, newCardNum)
			return
		}
		let nextPlayerId;
		_.map(keys, (otherPlayerId, idx)=>{
			if (otherPlayerId === playerId) {
				nextPlayerId = idx + 1 >= _.size(keys) ? keys[0] : keys[idx + 1];
			}
		})
		
		
		// 1. 更新摸牌人的手牌
		const {newRoomInfo, newCards} = RoomService.updateHandCards(roomId, nextPlayerId, newCardNum)
		
		// 2. 更新操作人位置为下家（playCard方法已经重置过了，多次重置防止网络波动BUG）
		RoomService.updateGameCollectionsDeep(roomId, "optionPos", this.getPosById(roomId,nextPlayerId))
		
		
		// 3. 发一张牌给下家
		ws.sendToUser(nextPlayerId, "摸一张牌", {cardNum: newCardNum,roomInfo: newRoomInfo, gameInfo,playerId: nextPlayerId }, "deliverCard");
		const otherIds = _.filter(tableIds, t=> t !== nextPlayerId);
		ws.sendDifferenceUser(otherIds, "摸一张牌", {cardNum: null,roomInfo: newRoomInfo, gameInfo,playerId: nextPlayerId }, "deliverCard")
		// 4. 自摸牌检测
		this.checkHandCardAfterDraw(roomId, nextPlayerId, newCards, newCardNum, ws);
		
	},
	/**
	 * 摸牌后检测：自摸、花牌、暗杠、补杠
	 * @param {string} roomId
	 * @param {string} playerId - 摸牌人
	 * @param {number[]} newCards - 摸牌后的手牌数组
	 * @param {number} newCardNum - 摸到的牌
	 * @param {object} ws - SocketService实例
	 */
	checkHandCardAfterDraw: function (roomId, playerId, newCards, newCardNum, ws) {
		let gameInfo = RoomService.getGameInfo(roomId)
		let roomInfo = RoomService.getRoomInfo(roomId)
		const isWinning = this.checkIsWinning(newCards);
		if(isWinning){
			ws.sendToUser(playerId, "自摸，可以胡牌", {operateType: 4, playerId: playerId, gameInfo, roomInfo}, "operate");
			return;
		}
		//花
		
		const flowerCards = _.filter(newCards, c => c >= 211 && c <= 218);
		const firstFlower = flowerCards[0];
		const flowerCardNum = firstFlower || (newCardNum >= 211 && newCardNum <= 218 ? newCardNum : null);
		
		if(flowerCardNum){
			
			ws.sendToUser(playerId, "摸到花牌", {
				operateType: 7,  // 花牌杠单独一个type，客户端静默处理
				cardNum: flowerCardNum,
				playerId: playerId,
				gameInfo,
				roomInfo
			}, "operate");
			return;
			
		}
		// 6a. 暗杠检测 → 摸到的牌+手里已有3张
		const newCardVal = newCardNum % 50;
		const sameCard = _.size(_.filter(newCards, h => !(h >= 211 && h <= 218) && h % 50 === newCardVal));
		if(sameCard === 4){
			ws.sendToUser(playerId, "暗杠(摸到第4张)", {
				operateType: 6,  // 花牌杠单独一个type，客户端静默处理
				cardNum: newCardNum,
				playerId: playerId,
				gameInfo,
				roomInfo
			}, "operate");
			return;
		}

		// 6b. 暗杠检测 → 手里原本就有4张（和摸到的牌无关）
		const handCards = _.get(roomInfo, `${playerId}.handCards`, []);
		const cardValCounts = _.countBy(_.filter(handCards, h => !(h >= 211 && h <= 218)), h => h % 50);
		for(const [val, count] of Object.entries(cardValCounts)){
			if(count === 4 && Number(val) !== newCardVal){
				ws.sendToUser(playerId, "暗杠(手里4张)", {
					operateType: 6,
					cardNum: Number(val),  // ← 发val，不是newCardNum
					playerId: playerId,
					gameInfo,
					roomInfo
				}, "operate");
				return;
			}
		}
		

		// 7. 补杠检测 → 碰牌区有3张同权值
		const pengCards = _.get(roomInfo, `${playerId}.pengCards`, []);
		const matchInPeng = _.filter(pengCards, p => !(p >= 211 && p <= 218) && p % 50 === newCardVal);
		if(matchInPeng.length === 3){
			ws.sendToUser(playerId, "补杠", {
				operateType: 5,  // 花牌杠单独一个type，客户端静默处理
				cardNum: newCardNum,
				playerId: playerId,
				gameInfo,
				roomInfo
			}, "operate");
			return;
		}
		
	},
	/**
	 * 通过playerId获取位置
	 */
	getPosById: function (roomId, playerId) {
		const gameInfo = RoomService.getGameInfo(roomId);
		const tableIds = gameInfo?.tableIds;
		let pos = null;
		_.map(tableIds, (key, idx) => {
			if (playerId === key) pos = idx
		})
		return pos
	},
	/**
	 * 开碰
	 */
	peng: function (roomId, playerId, cardNum){
		
		const roomInfo = RoomService.getRoomInfo(roomId);
		const activeCardNum = RoomService.getGameInfoDeep(roomId, "activeCardNum");
		const oldHandCards = _.get(roomInfo, `${playerId}.handCards`);
		const targetValue = cardNum % 50;
		const matches = _.filter(oldHandCards, card => 
			!(card >= 211 && card <= 218) && card % 50 === targetValue
		);
		
		if(matches.length < 2) {
			
			return roomInfo;
		}
		const pengArr = matches.slice(0, 2);
		const newHandCards = _.filter(oldHandCards, o => 
			!(o >= 211 && o <= 218) ? o % 50 !== targetValue : true
		);
		RoomService.updateRoomInfoDeep("handCards", playerId, roomInfo, newHandCards);

		const oldPengCards = RoomService.getRoomInfoDeep(roomId, playerId, "pengCards") || [];
		const playCardPlayerId = RoomService.getGameInfoDeep(roomId, 'playCardPlayerId');
		let pengCards = [];

		if(_.includes(this.computedCards(pengArr), cardNum % 50)){
			pengCards = _.concat([], oldPengCards, pengArr, [cardNum]);
			
			RoomService.updateRoomInfoDeep("playedCards", playCardPlayerId, roomInfo, _.filter(roomInfo[playCardPlayerId]?.playedCards, o => o !== cardNum));
		} else {
			const allPlayedCards = RoomService.getGameInfoDeep(roomId, "allPlayedCards");
			const correctCardNum = _.find(allPlayedCards, o => !(o >= 211 && o <= 218) && o % 50 === targetValue);
			
			pengCards = _.concat([], oldPengCards, pengArr, [correctCardNum]);
			RoomService.updateRoomInfoDeep("playedCards", playCardPlayerId, roomInfo, _.filter(roomInfo[playCardPlayerId]?.playedCards, o => o !== correctCardNum));
		}

		
		RoomService.updateRoomInfoDeep("pengCards", playerId, roomInfo, pengCards);
		RoomService.updateGameCollectionsDeep(roomId, "optionTime", moment().valueOf());
		RoomService.updateGameCollectionsDeep(roomId, "optionPos", this.getPosById(roomId, playerId));
		
		const finalRoomInfo = RoomService.getRoomInfo(roomId);
		
		return finalRoomInfo;
	},

	gang: function (roomId, playerId, cardNum, type) {
		
		try {
			const roomInfo = RoomService.getRoomInfo(roomId);
			const oldHandCards = _.get(roomInfo, `${playerId}.handCards`) || [];
			const pengCards = RoomService.getRoomInfoDeep(roomId, playerId, "pengCards") || [];
			const oldGangCards = RoomService.getRoomInfoDeep(roomId, playerId, "gangCards") || [];

			let gangArr = [];
			let newHandCards = oldHandCards;
			let newPengCards = pengCards;

			if (type === 'huagang') {
				newHandCards = _.filter(oldHandCards, h => h !== cardNum);
				gangArr = [cardNum];
				

			} else {
				const n = cardNum % 50;
				const fromHand = _.filter(oldHandCards, h => !(h >= 211 && h <= 218) && h % 50 === n);
				const fromPeng = _.filter(pengCards, p => !(p >= 211 && p <= 218) && p % 50 === n);
				const allFound = [...fromHand, ...fromPeng];
				

				const activeCardNum = RoomService.getGameInfoDeep(roomId, 'activeCardNum');
				if (activeCardNum != null && activeCardNum % 50 === n && !_.find(allFound, c => c === activeCardNum)) {
					allFound.push(activeCardNum);
					
				}

				if (type === 'bugang') {
					if (fromPeng.length < 3 || fromHand.length < 1) {
						
						return { error: 'bugang: 牌数不足', code: 2002 };
					}
					gangArr = [...fromPeng, fromHand[0]];
					newHandCards = _.filter(oldHandCards, h => !(h >= 211 && h <= 218) ? h % 50 !== n : true);
					newPengCards = _.filter(pengCards, p => !(p >= 211 && p <= 218) ? p % 50 !== n : true);

				} else if (type === 'minggang') {
					const playCardPlayerId = RoomService.getGameInfoDeep(roomId, 'playCardPlayerId');
					const playedCards = roomInfo[playCardPlayerId]?.playedCards || [];
					const riverCard = _.find(playedCards, o => !(o >= 211 && o <= 218) && o % 50 === n);
					
					if (fromHand.length < 3 || !riverCard) {
						
						return { error: 'minggang: 牌数不足', code: 2003 };
					}
					gangArr = [...fromHand.slice(0, 3), riverCard];
					let removed = 0;
					newHandCards = _.filter(oldHandCards, h => {
						if (!(h >= 211 && h <= 218) && h % 50 === n && removed < 3) { removed++; return false; }
						return true;
					});
					RoomService.updateRoomInfoDeep("playedCards", playCardPlayerId, roomInfo, _.filter(playedCards, o => o !== riverCard));

				} else if (type === 'angang') {
					if (allFound.length < 4) {
						
						return { error: 'angang: 牌数不足', code: 2004 };
					}
					gangArr = allFound.slice(0, 4);
					newHandCards = _.filter(oldHandCards, h => !(h >= 211 && h <= 218) ? h % 50 !== n : true);
					newPengCards = _.filter(pengCards, p => !(p >= 211 && p <= 218) ? p % 50 !== n : true);
				}
			}

			
			const newCard = RoomService.getLastNextCard(roomId);
			const finalHandCards = this.adjustHandCards(_.concat(newHandCards, [newCard]));
			RoomService.updateRoomInfoDeep("handCards", playerId, roomInfo, finalHandCards);
			RoomService.updateRoomInfoDeep("pengCards", playerId, roomInfo, newPengCards);
			RoomService.updateRoomInfoDeep("gangCards", playerId, roomInfo, _.concat(oldGangCards, gangArr));

			RoomService.updateGameCollectionsDeep(roomId, "optionTime", moment().valueOf());
			RoomService.updateGameCollectionsDeep(roomId, "optionPos", this.getPosById(roomId, playerId));

			const finalRoomInfo = RoomService.getRoomInfo(roomId);
			
			return { roomInfo: finalRoomInfo};

		} catch (err) {
			
			return { error: '服务器内部错误', code: 9999 };
		}
	},
	/**
	 * 胡牌
	 * 【结算分数】
	 * 【杠牌算 杠数*10分】
	 */
	win: function (roomId, playerId, cardNum) {
		// cardNum 有数据则是胡别人的牌， cardNum无数据则是自摸胡牌
		const roomInfo = RoomService.getRoomInfo(roomId);
		const handCards = _.get(roomInfo, `${playerId}.handCards`);
		const playedCards = _.get(roomInfo, `${playerId}.playedCards`);
		const cards = _.concat([], handCards, playedCards, cardNum);
		let gangCount = 0;
		// 检查是否有杠牌
		for (let i = 0; i < cards.length - 3; i++) {
			if (cards[i] % 50 === cards[i + 1] % 50 && cards[i] % 50 === cards[i + 2] % 50 && cards[i] % 50 === cards[i + 3] % 50) {
				gangCount++
			}
		}
		let result = {}
		_.forEach(roomInfo, (value, key) => {
			result[key] = {
				cards: this.adjustHandCards(_.concat([], _.get(value, 'handCards'), key === playerId ? [cardNum] : null)),
				isWinner: key === playerId,
				gangCount: key === playerId ? gangCount : 0,
				score: key === playerId ? gangCount * this.gangScore + this.winScore : -(this.winScore)
			}
		})
		return result;
	},
	/**
	 * 流局
	 * 【结算分数】
	 * 【杠牌算 杠数*10分】
	 */
	flow: function (roomId,playerId, cardNum){
		const SocketService = require("@/core/socket/SocketService");
		const ws = SocketService.getInstance();
		// cardNum 有数据则是胡别人的牌， cardNum无数据则是自摸胡牌
		const roomInfo = RoomService.getRoomInfo(roomId);
		let result = {}
		_.forEach(roomInfo, (value, key) => {
			const handCards = _.get(roomInfo, `${key}.handCards`);
			const playedCards = _.get(roomInfo, `${key}.playedCards`);
			const cards = _.concat([], handCards, playedCards, cardNum);
			let gangCount = 0;
			// 检查是否有杠牌
			for (let i = 0; i < cards.length - 3; i++) {
				if (cards[i] % 50 === cards[i + 1] % 50 && cards[i] % 50 === cards[i + 2] % 50 && cards[i] % 50 === cards[i + 3] % 50) {
					gangCount++
				}
			}
			result[key] = {
				cards: this.adjustHandCards(_.concat([], _.get(value, 'handCards'), key === playerId ? [cardNum] : null)),
				isWinner: null,
				isFlow: true,
				gangCount: gangCount,
				score: gangCount * this.gangScore
			}
		})
		_.forEach(roomInfo, (value, key) => {
			ws.sendToUser(key, "流局，无人胜出", {result}, "flow");
		})
		const newRoomInfo = RoomService.resetRoomForNextGame(roomId);
		return result;
	},
	/**
	 * 过（不执行碰/杠/胡操作）
	 * 跳过碰/杠/胡检测，直接让出牌人的下家摸牌
	 * @param roomId
	 * @param playerId
	 */
	pass: function (roomId, playerId) {
		const playCardPlayerId = RoomService.getGameInfoDeep(roomId, "playCardPlayerId");
		this.handleOtherPlayerCard(roomId, playCardPlayerId, null, true);
	}
}

module.exports = GameService
