// Copyright 2016 Paul Brewer, Economic and Financial Technology Consulting LLC                             // This is open source software. The MIT License applies to this software.                                  // see https://opensource.org/licenses/MIT or included License.md file

/* jshint node:true,esnext:true,eqeqeq:true,undef:true,lastsemic:true */

// order format (subtract 2 from indexid as counter and tolocal are prepended on submission)
// order = [
// 0      counter: // strictly increasing, may have gaps
// 1      tlocal: // local insertion time   (numeric JS timestamp)
// 2      t: // official time
// 3      tx: // expiration time, in units of official time 
// 4      u: user number
// 5      c: // 1 to cancel all active orders by userid
// 6      q: // quantity (could be 0)
// 7      b: // limit order price to buy
// 8      s: // limit order price to sell 
// 9      bs: // buy stop.  rising price triggers market order to buy (numeric)
// 10     bsp: // buy stop limit price. buy limit price sent when trade price is greater than or equal to stop
// 11     ss: // sell stop. falling price triggers market order to sell (numeric)
// 12     ssp: // sell stop limit price. sell limit price sent when trade price is less than or equal to stop
// 13     trigb: //  triggers new buy limit order asap
// 14     trigs: //  triggers new sell limit order asap
// 15     trigbs: // triggers new buy stop order asap
// 16     trigbsp: // limit price if triggered buy stop is activated
// 17     trigss: // triggers new sell stop order asap
// 18     trigssp: // limit price if triggered sell stop is activated
// ]

try { fs = require('fs'); } catch(e) {};

const async = require('async');

const MEC = require('market-example-contingent');
var Market = MEC.Market;
const MarketAgents = require('market-agents');
var Agent = MarketAgents.Agent;
var ziAgent = MarketAgents.ziAgent;
var Pool = MarketAgents.Pool;

var simpleOrder = function(t,uid,cancelreplace){
    var i,l,o;
    for(i=0,l=17,o=[];i<l;++i) o[i]=0;
    o[0]=t;
    o[2]=uid;
    o[3]=cancelreplace;
    o[4]=1; // quantity
    return o;
};

var simpleBuyOrder = function(t,uid,buyprice,keepOldOrders){
    var o = simpleOrder(t,uid,((keepOldOrders)?0:1));
    o[5]=buyprice;
    return o;
};

var simpleSellOrder = function(t,uid,sellprice,keepOldOrders){
    var o = simpleOrder(t,uid,((keepOldOrders)?0:1));
    o[6]=sellprice;
    return o;
}; 

var Log = function(fname){
    this.useFS = false;
    try { 
	this.useFS = ( (typeof(fname)==='string') 
		       && (fs) 
		       && (fs.openSync) 
		       && (fs.writeSync) );
    } catch(e){};
    if (this.useFS)
	this.fd = fs.openSync(fname, 'w');
    else
	this.data = [];
};

Log.prototype.write = function(x){
    if (this.useFS){
	if (Array.isArray(x)){
	    fs.writeSync(this.fd, x.join(",")+"\n");
	} else if ((typeof(x)==='number') || (typeof(x)==='string')){
	    fs.writeSync(this.fd, x+"\n");
	} else {
	    fs.writeSync(this.fd, JSON.stringify(x)+"\n");
	}
    } else {
	this.data.push(x);
    }
};

var Simulation = function(options){
    this.options = options;
    // expected options
    // periods:  number of periods to run
    // buyerValues array of one for each ZI buyer
    // sellerCosts one for each ZI seller
    // L is the lowest possible random bid price
    // H is the highest possible random ask price
    // maxTries -- maximum number of tries to generate order
    this.numberOfBuyers = options.numberOfBuyers;
    if (!this.numberOfBuyers){
	if (Array.isArray(options.buyerValues))
	    this.numberOfBuyers = options.buyerValues.length;
    }
    this.numberOfSellers = options.numberOfSellers;
    if (!this.numberOfSellers){
	if (Array.isArray(options.sellerCosts))
	    this.numberOfSellers = options.sellerCosts.length;
    }
    if ( (!this.numberOfBuyers) || (!this.numberOfSellers) )
	throw new Error("single-market-robot-simulation: can not determine numberOfBuyers and/or numberOfSellers ");
    this.numberOfAgents = this.numberOfBuyers+this.numberOfSellers;
    this.logs = {};
    this.logs.trade  = new Log("./trades.csv");
    this.logs.order  = new Log('./orders.csv');
    this.logs.period = new Log('./periods.csv');
    this.logs.trade.write(['period','t','price','buyerAgentId','buyerValue','buyerProfit','sellerAgentId','sellerCost','sellerProfit']);
    var i,l;
    var a;
    this.pool = new Pool();
    this.buyersPool = new Pool();
    this.sellersPool = new Pool();
    var common = {
	integer: options.integer,
	ignoreBudgetConstraint: options.ignoreBudgetConstraint,
	markets: {X:{}},
	period: {number:0, equalDuration:true, duration:(options.periodDuration || 1000), init: {inventory:{X:0, money:0}}},
	minPrice: options.L || 0,
	maxPrice: options.H || (2*Math.max(options.buyerValues[0], options.sellerCosts[options.sellerCosts.length-1]))
    };
    var newBuyerAgent = function(){
	return new ziAgent(Object.assign({}, common, {rate: (options.buyerRate || 1)}));
    };
    var newSellerAgent = function(){
	return new ziAgent(Object.assign({}, common, {rate: (options.sellerRate || 1)}));
    };
    for(i=0;i<this.numberOfBuyers;++i){
	a = newBuyerAgent();
	this.buyersPool.push(a);
	this.pool.push(a);
    }
    for(i=0;i<this.numberOfSellers;++i){
	a = newSellerAgent();
	this.sellersPool.push(a);
	this.pool.push(a);
    }
    this.buyersPool.distribute('values','X',options.buyerValues);
    this.sellersPool.distribute('costs','X',options.sellerCosts);
    this.period = 0;
    this.periodDuration = common.period.duration;
    /* ignore console.log messages in coverage testing */
    /* istanbul ignore if */
    if (!this.options.silent){
	console.log("duration of each period = "+this.periodDuration);
	console.log(" ");
	console.log("Number of Buyers  = "+this.numberOfBuyers);
	console.log("Number of Sellers = "+this.numberOfSellers);
	console.log("Total Number of Agents  = "+this.numberOfAgents);
	console.log(" ");
	console.log("minPrice = "+common.minPrice);
	console.log("maxPrice = "+common.maxPrice);
    }
};

Simulation.prototype.runPeriod = function(cb){
    var sim = this;
    sim.period++;
    /* istanbul ignore if */
    if (!sim.options.silent)
	console.log("period: "+sim.period);
    sim.pool.initPeriod(sim.period);
    sim.xMarket = new Market(this.options.xMarket);
    sim.xMarket.on('trade', function(tradeSpec){ 
	tradeSpec.money = 'money';
	tradeSpec.goods = 'X';
	sim.logTrade(tradeSpec);
	sim.pool.trade(tradeSpec);
    });
    ziAgent.prototype.bid = function(good, price){
	if ((typeof(good)!=='string') ||
	    (typeof(price)!=='number'))
	    throw new Error("bid function received invalid parameters: "+typeof(good)+" "+typeof(price));
	var order = simpleBuyOrder(this.wakeTime, this.id, price, sim.options.keepPreviousOrders);
	if (good === 'X'){
	    sim.logOrder([this.period.number, this.wakeTime, this.id, 1, price, this.unitValueFunction('X',this.inventory), this.inventory.X]);
	    sim.xMarket.inbox.push(order);
	    while(sim.xMarket.inbox.length>0)
		sim.xMarket.push(sim.xMarket.inbox.shift());
	}
    };
    ziAgent.prototype.ask = function(good, price){
	if ((typeof(good)!=='string') ||
	    (typeof(price)!=='number'))
	    throw new Error("ask function received invalid parameters: "+typeof(good)+" "+typeof(price));
	var order = simpleSellOrder(this.wakeTime, this.id, price, sim.options.keepPreviousOrders);
	if (good === 'X'){
	    sim.logOrder([this.period.number, this.wakeTime, this.id, -1, price, this.unitCostFunction('X',this.inventory), this.inventory.X]);
	    sim.xMarket.inbox.push(simpleSellOrder(this.wakeTime,this.id,price));
	    while(sim.xMarket.inbox.length>0)
		sim.xMarket.push(sim.xMarket.inbox.shift());
	}
    };
    if (typeof(cb)==='function'){
	/* run asynchronously, call cb function at end */
	var poolCallback = function(e){
	    this.endPeriod();
	    var final_money = this.agents.map(function(A){
		return A.inventory.money;
	    });
	    sim.logPeriod(final_money);
	    cb(false, sim);
	};
	return sim.pool.run(sim.pool.endTime(),poolCallback, 10);
    } else {
	/* no callback; run synchronously */
	sim.pool.syncRun(sim.pool.endTime());
	sim.pool.endPeriod();
	var finalMoney = sim.pool.agents.map(function(A){ return A.inventory.money; });
	sim.logPeriod(finalMoney);
	return(sim);
    }
};    	       

Simulation.prototype.logOrder = function(details){ 
    this.logs.order.write(details);
};

Simulation.prototype.logPeriod = function(details){ 
    this.logs.period.write(details);
};

Simulation.prototype.logTrade = function(tradespec){
    var sim = this;
    var idCol = sim.xMarket.o.idCol;
    // this is only sufficient for single unit trades
    if ( (tradespec.totalQ!==1) ||
	 (tradespec.buyA.length!==1) ||
	 (tradespec.sellA.length!==1) )
	throw new Error("Simulation.prototype.logTrade: single unit trades required, got: "+tradespec.totalQ);
    var buyerid  = sim.xMarket.a[tradespec.buyA[0]][idCol];
    var sellerid = sim.xMarket.a[tradespec.sellA[0]][idCol];
    var tradePrice = tradespec.prices[0];
    if (!tradePrice) throw new Error("Simulation.prototype.logTrade: undefined price in trade ");
    var tradeBuyerValue = sim.pool.agentsById[buyerid].unitValueFunction('X', sim.pool.agentsById[buyerid].inventory);
    var tradeBuyerProfit = tradeBuyerValue-tradePrice;
    var tradeSellerCost = sim.pool.agentsById[sellerid].unitCostFunction('X', sim.pool.agentsById[sellerid].inventory);
    var tradeSellerProfit = tradePrice-tradeSellerCost;
    var tradeOutput = [
	sim.period,
	tradespec.t,
	tradePrice,
	buyerid,
	tradeBuyerValue,
	tradeBuyerProfit,
	sellerid,
	tradeSellerCost,
	tradeSellerProfit
    ];
    sim.logs.trade.write(tradeOutput);
};

var runSimulation = function(config, done, update, delay){
    var mySim = new Simulation(config);
    var periodNumber = 1;
    /* istanbul ignore if */
    if (!config.silent)
	console.log("Periods = "+config.periods);
    if(typeof(done)==='function'){
	async.whilst(
	    function(){ 
		return (mySim.period<config.periods); 
	    },
	    function(callback){ 
		setTimeout(function(){
		    mySim.runPeriod(function(e,d){
			if (typeof(update)==='function') update(e,d);
			callback(e,d);
		    });
		}, (delay || 100) );
	    },
	    function(e,d){ 
		/* istanbul ignore if */
		if (!config.silent)
		    console.log("done");
		done(false, mySim);
	    }
	);
    } else {
	/* no done callback, run synchronously */
	while(mySim.period<config.periods){
	    mySim.runPeriod();
	}
	/* istanbul ignore if */
	if (!config.silent)
	    console.log("done");
    }
    return mySim;
};

var main = function(){

    var config = require('./config.json');

    runSimulation(config);

};

if (require && (require.main===module)){
    main();
} else if (typeof(module)==='object') {
    module.exports = {
	Simulation: Simulation,
	runSimulation: runSimulation,
	Log: Log,
    }
}

