/* eslint-env node, mocha */

/* eslint no-console: "off", newline-per-chained-call: "off" */

import assert from 'assert';
import 'should';
import * as singleMarketRobotSimulator from '../src/index.js';
import * as MEC from 'market-example-contingent';
import * as MarketAgents from 'market-agents';
import * as stats from 'stats-lite';

const {Simulation} = singleMarketRobotSimulator;
const {Pool, ZIAgent} = MarketAgents;

const tradeLogHeader = [
    'period',
    't',
    'tp',
    'price',
    'buyerAgentId',
    'buyerValue',
    'buyerProfit',
    'sellerAgentId',
    'sellerCost',
    'sellerProfit'
];

const combinedOrderLogHeader = [
    'period',
    't',
    'tp',
    'id',
    'x',
    'buyLimitPrice',
    'value',
    'sellLimitPrice',
    'cost'
];

const gini = require("gini-ss");

function tradesToOHLC(tradeDataReference, ids){
    const ohlc = [];
    const ohlcHeader = singleMarketRobotSimulator.logHeaders.ohlc;
    const tradeData = tradeDataReference.slice(0);
    const tradeHeader = tradeData.shift();
    ohlc.push(ohlcHeader);
    const periodCol = tradeHeader.indexOf('period');
    function finalMoney(trades){
        const money = new Array(ids.length).fill(0);
        const [
            buyerProfitCol,
            sellerProfitCol,
            buyerAgentIdCol,
            sellerAgentIdCol
        ] = [
            'buyerProfit',
            'sellerProfit',
            'buyerAgentId',
            'sellerAgentId'
        ].map((s)=>(tradeHeader.indexOf(s)));
        for(let i=0,l=trades.length;i<l;++i){
            let buyerSlot = ids.indexOf(trades[i][buyerAgentIdCol]);
            let sellerSlot = ids.indexOf(trades[i][sellerAgentIdCol]);
            if (buyerSlot === -1)
                throw new Error("tradesToOHLC: found unexpected buyerAgentId");
            if (sellerSlot === -1)
                throw new Error("tradesToOHLC: found unexpected sellerAgentId");
            money[buyerSlot]  += trades[i][buyerProfitCol];
            money[sellerSlot] += trades[i][sellerProfitCol];
        }
        return money;
    }
    function process(period, trades){
        const priceCol = tradeHeader.indexOf('price');
        const prices = trades.map((row)=>(row[priceCol]));
        const result = {
            period,
            open: prices[0],
            high: Math.max(...prices),
            low:  Math.min(...prices),
            close: prices[prices.length-1],
            volume:  prices.length,
            median: stats.median(prices),
            mean: stats.mean(prices),
            sd:  stats.stdev(prices),
            p25: stats.percentile(prices,0.25),
            p75: stats.percentile(prices,0.75),
            gini: gini(finalMoney(trades))
        };
        return ohlcHeader.map((s)=>(result[s]));
    }
    let periodTradeData = [];
    let period = 0;
    for(let i=0,l=tradeData.length;i<l;++i){
        if (period!==tradeData[i][periodCol]){
            if (periodTradeData.length) ohlc.push(process(period, periodTradeData));
            periodTradeData = [];
            period = tradeData[i][periodCol];
        }
        periodTradeData.push(tradeData[i]);
    }
    if (periodTradeData.length) ohlc.push(process(period, periodTradeData));
    return ohlc;
}

describe('logNames ', function(){
    it('should be defined', function(){
        singleMarketRobotSimulator.logNames.length.should.be.above(0);
    });
    it('should contain at least every key of logHeaders', function(){
        Object.keys(singleMarketRobotSimulator.logHeaders).forEach((k)=>(assert.ok(singleMarketRobotSimulator.logNames.includes(k))));
    });
});

describe('logHeaders ', function(){
    it('should be defined', function(){
        Object.keys(singleMarketRobotSimulator.logHeaders).length.should.be.above(0);
    });
});

describe('trade log header ', function(){
    it('should contain expected fields', function(){
        singleMarketRobotSimulator.logHeaders.trade.should.deepEqual(tradeLogHeader);
    });
});

describe('order log headers ',  function(){
    it('should contain expected fields', function(){
        (singleMarketRobotSimulator
         .logNames
         .filter((n)=>(n.includes("order")))
         .map((n)=>(singleMarketRobotSimulator.logHeaders[n]))
         .forEach((h)=>(h.should.deepEqual(combinedOrderLogHeader)))
        );
    });
});

describe('blank Simulation not allowed', function(){
    
    delete global.fs;
    it('new Simulation({}) with empty config {} should throw error', function(){
        function simulationWithOmittedOptions(){
            let S = new Simulation({});  // eslint-disable-line no-unused-vars
        }
        simulationWithOmittedOptions.should.throw();
    });
});

describe('simulation with values [10,9,8] all below costs [20,40]', function(){

    // buyerRate and sellerRate will default to [1.0] if absent and are coerced to positive number arrays by positiveNumberArray()
    // setting buyerRate to [1.0,1.0] should detect if there is some problem using arrays without affecting math tests
    
    let configCostsExceedValues = {
        L:1,
        H:100,
        buyerValues: [10,9,8],
        sellerCosts: [20,40],
        buyerAgentType: ["ZIAgent"],
        sellerAgentType: ["ZIAgent"],
        buyerRate: [1.0,1.0],
        sellerRate: 1.0,
        silent: 1
    };
    describe('on new Simulation', function(){
        let S = new Simulation(configCostsExceedValues);
        let props = ['config', 
                     'numberOfBuyers',
                     'numberOfSellers',
                     'numberOfAgents',
                     'logs',
                     'pool',
                     'buyersPool',
                     'sellersPool',
                     'period',
                     'periodDuration'
                    ];
        it('should have properties '+props.join(","), function(){
            S.should.have.properties(props);
        });
        it('should set .config properly', function(){
            assert.ok(S.config===configCostsExceedValues);
        });
        it('should set .numberOfBuyers to 3', function(){
            S.numberOfBuyers.should.equal(3);
        });
        it('should set .numberOfSellers to 2', function(){
            S.numberOfSellers.should.equal(2);
        });
        it('should set .numberOfAgents to 5', function(){
            S.numberOfAgents.should.equal(5);
        });
        let logsProps = ['trade','buyorder','sellorder','rejectbuyorder','rejectsellorder','profit','ohlc','effalloc'];
        it('.logs should have properties '+logsProps.join(','), function(){
            S.logs.should.have.properties(logsProps);
        });
        it('trade, buyorder, sellorder, ohlc logs have header rows; profit log is empty', function(){
            let withHeaderRow = ['trade','buyorder','sellorder','ohlc','effalloc'];
            withHeaderRow.forEach(function(prop){ S.logs[prop].data.length.should.equal(1); });
            S.logs.trade.data[0].should.deepEqual(tradeLogHeader);
            S.logs.buyorder.data[0].should.deepEqual(combinedOrderLogHeader);
            S.logs.sellorder.data[0].should.deepEqual(combinedOrderLogHeader);
            S.logs.rejectbuyorder.data[0].should.deepEqual(combinedOrderLogHeader);
            S.logs.rejectsellorder.data[0].should.deepEqual(combinedOrderLogHeader);
            S.logs.profit.data.length.should.equal(0);
        });

        it('.pool should be an instance of Pool containing 5 (ZI) agents with .bidPrice and .askPrice functions',function(){
            S.pool.should.be.an.instanceOf(Pool); 
            S.pool.agents.length.should.equal(5);
            S.pool.agents.forEach(function(A){ 
                A.should.be.an.instanceOf(ZIAgent).and.have.properties('bidPrice','askPrice');  
            });
        });
        it('.pool agent ids should be 1,2,3,4,5', function(){
            S.pool.agents.map((a)=>(a.id)).should.deepEqual([1,2,3,4,5]);
        });
        it('.buyersPool should be an instance of Pool containing 3 agents', function(){
            S.buyersPool.should.be.an.instanceOf(Pool); 
            S.buyersPool.agents.length.should.equal(3);
        });
        it('.buyersPool agent ids should be 1,2,3', function(){
            S.buyersPool.agents.map((a)=>(a.id)).should.deepEqual([1,2,3]);
        });
        it('.sellersPool should be an instance of Pool containing 2 agents', function(){
            S.sellersPool.should.be.an.instanceOf(Pool);
            S.sellersPool.agents.length.should.equal(2);
        });
        it('.sellersPool agent ids should be 4,5', function(){
            S.sellersPool.agents.map((a)=>(a.id)).should.deepEqual([4,5]);
        });
        it('.period should be zero', function(){
            S.period.should.equal(0);
        });
        it('.periodDuration should be 1000 (default)', function(){
            S.periodDuration.should.equal(1000);
        });
        it('getMaximumPossibleGainsFromTrade() should be 0, and set sim.maximumPossibleGainsFromTrade', function(){
            S.getMaximumPossibleGainsFromTrade().should.equal(0);
            S.maximumPossibleGainsFromTrade.should.equal(0);
        });
    });

    function testsForConfigCostsExceedValues(state){
        it('should increment .period', function(){
            state.S.period.should.equal(1);
        });
        it('should have property xMarket -- an instance of Market', function(){
            state.S.should.have.property('xMarket');
            state.S.xMarket.should.be.instanceOf(MEC.Market);
        });
        it('the buyorder log should have the header row and between ~2750 and ~3250 orders (5 sigma, poisson 3*1000)', function(){
            state.S.logs.buyorder.data[0].should.deepEqual(combinedOrderLogHeader);
            state.S.logs.buyorder.data.length.should.be.within(2750,3250);
        });
        it('the sellorder log should have the header row and between ~1750 and ~2250 orders (5 sigma, poisson 2*1000)', function(){
            state.S.logs.sellorder.data[0].should.deepEqual(combinedOrderLogHeader);
            state.S.logs.sellorder.data.length.should.be.within(1750,2250);
        });
        
        /*
         * Buy order log and sell order log need to have no "undefined" values.  Blank string is OK for "not applicable"
         *
         */
         
        it('buy order log defines all fields on every row', function(){
            state.S.logs.buyorder.data.forEach((row)=>{
                row.length.should.equal(combinedOrderLogHeader.length);
                row.forEach((cell)=>{
                    assert.ok(typeof(cell)!=='undefined');
                });
            });
        });

        it('sell order log defines all fields on every row', function(){
            state.S.logs.sellorder.data.forEach((row)=>{
                row.length.should.equal(combinedOrderLogHeader.length);
                row.forEach((cell)=>{
                    assert.ok(typeof(cell)!=='undefined');
                });
            });
        });        
        it('the trade log should have one entry, the header row', function(){
            state.S.logs.trade.data.length.should.be.equal(1);
            state.S.logs.trade.data[0].should.deepEqual(tradeLogHeader);                
        }); 
        it('the profit log should have one entry equal to [0,0,0,0,0]', function(){
            state.S.logs.profit.data.length.should.be.equal(1);
            state.S.logs.profit.data.should.deepEqual([[0,0,0,0,0]]);
        }); 
        it('the ohlc log should have header row', function(){
            state.S.logs.ohlc.data.length.should.equal(1);
        });
        it('the effalloc log should have only the header row and no entries, because 0/0 is not reported', function(){
            state.S.logs.effalloc.data.length.should.equal(1);
        });
        it('.logTrade({totalQ:2}) should throw because of single unit trade requirement', function(){
            function logTwoUnitTrade(){ state.S.logTrade({totalQ:2}); }
            logTwoUnitTrade.should.throw();
        });
    }

    describe('runPeriod({sync:true})', function(){

        /* runPeriod({sync:true}) is synchronous */

        let mySim = new Simulation(configCostsExceedValues);
        let sim = mySim.runPeriod({sync:true});
        it('should modify in place and return the original simulation object', function(){
            assert.ok(mySim===sim);
        });
        testsForConfigCostsExceedValues({S:mySim});
    });

    describe('runPeriod() runs asynchronously', function(){
        it('immediate inspection of order logs should only have length 1 from header row', function(done){
            let mySim = new Simulation(configCostsExceedValues);
            (mySim
             .runPeriod()
             .then(
                 function(){ 
                     done();
                 })
             .catch(
                 function(e){ 
                     assert.ok(false, e);
                 })
                 );
            mySim.logs.buyorder.data.length.should.equal(1);
            mySim.logs.sellorder.data.length.should.equal(1);
        });
        describe('when done should pass same tests', function(){
            let state = {};
            before(function(done){
                let mySim = new Simulation(configCostsExceedValues);
                function callback(S){
                    state.S = S;
                    done();
                }
                (mySim
                 .runPeriod()
                 .then(callback, 
                       function(e){ 
                           throw e; 
                       })
                );
            });
            testsForConfigCostsExceedValues(state);
        });
    });
});         

describe('simulation with single unit trade, value [1000], costs [1]', function(){
    
    let configSingleUnitTrade = {
        L:1,
        H:1000,
        buyerValues: [1000],
        sellerCosts: [1],
        buyerAgentType: ["ZIAgent"],
        sellerAgentType: ["ZIAgent"],
        silent: 1
    };

    describe('on new Simulation', function(){
        let S = new Simulation(configSingleUnitTrade);
        let props = ['config', 
                     'numberOfBuyers',
                     'numberOfSellers',
                     'numberOfAgents',
                     'logs',
                     'pool',
                     'buyersPool',
                     'sellersPool',
                     'period',
                     'periodDuration'
                    ];
        it('should have properties '+props.join(","), function(){
            S.should.have.properties(props);
        });
        it('should set .config properly', function(){
            assert.ok(S.config===configSingleUnitTrade);
        });
        it('should set .numberOfBuyers to 1', function(){
            S.numberOfBuyers.should.equal(1);
        });
        it('should set .numberOfSellers to 1', function(){
            S.numberOfSellers.should.equal(1);
        });
        it('should set .numberOfAgents to 2', function(){
            S.numberOfAgents.should.equal(2);
        });
        let logsProps = ['trade','buyorder','sellorder','profit','ohlc'];
        it('.logs should have properties '+logsProps.join(','), function(){
            S.logs.should.have.properties(logsProps);
        });
        it('.pool should be an instance of Pool containing 2 (ZI) agents with .bidPrice and .askPrice functions',function(){
            S.pool.should.be.an.instanceOf(Pool);
            S.pool.agents.length.should.equal(2);
            S.pool.agents.forEach(function(A){ 
                A.should.be.an.instanceOf(ZIAgent).and.have.properties('bidPrice','askPrice'); 
            });
        });
        it('ids of agents in .pool should be [1,2]', function(){
            S.pool.agents.map((a)=>(a.id)).should.deepEqual([1,2]);
        });
        it('.buyersPool should be an instance of Pool containing 1 agents', function(){
            S.buyersPool.should.be.an.instanceOf(Pool);
            S.buyersPool.agents.length.should.equal(1);
        });
        it('.buyersPool should have an agent with id 1', function(){
            S.buyersPool.agents.map((a)=>(a.id)).should.deepEqual([1]);
        });
        it('.sellersPool should be an instance of Pool containing 1 agents', function(){
            S.sellersPool.should.be.an.instanceOf(Pool);
            S.sellersPool.agents.length.should.equal(1);
        });
        it('.sellersPool should have an agent with id 2', function(){
            S.sellersPool.agents.map((a)=>(a.id)).should.deepEqual([2]);
        });
        it('.period should be zero', function(){
            S.period.should.equal(0);
        });
        it('.periodDuration should be 1000 (default)', function(){
            S.periodDuration.should.equal(1000);
        });
        it('.getMaxPossibleGainsFromTrade() should equal 999', function(){
            S.getMaximumPossibleGainsFromTrade().should.equal(999);
        });
    });

    function testsForConfigSingleUnitTrade(state){
        it('should increment .period', function(){
            state.S.period.should.equal(1);
        });
        it('should have property xMarket -- an instance of Market', function(){
            state.S.should.have.property('xMarket');
            state.S.xMarket.should.be.instanceOf(MEC.Market);
        });
        it('should set .bid and .ask function for each agent', function(){
            state.S.pool.agents.forEach(function(A){
                assert.strictEqual(typeof(A.bid), 'function');
                assert.strictEqual(typeof(A.ask), 'function');
            });
        });
        it('the order logs should have at most ~2225 orders (5 sigma, poisson 2000, but will exhaust sooner by trade)', function(){
            let numberOfOrders = 
                state.S.logs.buyorder.data.length+state.S.logs.sellorder.data.length;
            numberOfOrders.should.be.below(2225);
        });
        it('the trade log should have two entrys, the header row plus a trade', function(){
            state.S.logs.trade.data.length.should.equal(2);
            state.S.logs.trade.data[0].should.deepEqual(tradeLogHeader);
            state.S.logs.trade.data[1].should.not.deepEqual(tradeLogHeader);
            state.S.logs.trade.data[1].length.should.equal(state.S.logs.trade.data[0].length);
        }); 
        it('the tradelog should report period 1', function(){
            state.S.logs.trade.data[1][0].should.equal(1);
        });
        it('the tradelog should report a trade price between 1 and 1000', function(){
            let priceCol = tradeLogHeader.indexOf("price");
            state.S.logs.trade.data[1][priceCol].should.be.within(1,1000);
        });
        it('the tradelog should report the correct buyerAgentId', function(){
            let buyerId = state.S.buyersPool.agents[0].id;
            let col = tradeLogHeader.indexOf("buyerAgentId");
            let tradeLogBuyerId = state.S.logs.trade.data[1][col];
            assert.ok(tradeLogBuyerId===buyerId);
        });
        it('the tradelog should report the correct buyerValue', function(){
            let col = tradeLogHeader.indexOf("buyerValue");
            state.S.logs.trade.data[1][col].should.equal(1000);
        });
        it('the tradelog should report the correct buyerProfit', function(){
            let buyerProfitCol = tradeLogHeader.indexOf("buyerProfit");
            let priceCol = tradeLogHeader.indexOf("price");
            state.S.logs.trade.data[1][buyerProfitCol].should.equal(1000-state.S.logs.trade.data[1][priceCol]);
        });
        it('the tradelog should report the correct sellerAgentId', function(){
            let sellerId = state.S.sellersPool.agents[0].id;
            let col = tradeLogHeader.indexOf("sellerAgentId");
            let tradeLogSellerId = state.S.logs.trade.data[1][col];
            assert.ok(tradeLogSellerId===sellerId);
        });
        it('the tradelog should report the correct seller cost', function(){
            let col = tradeLogHeader.indexOf("sellerCost");
            state.S.logs.trade.data[1][col].should.equal(1);
        });
        it('the tradelog should report the correct seller profit', function(){
            let sellerProfitCol = tradeLogHeader.indexOf("sellerProfit");
            let priceCol = tradeLogHeader.indexOf("price");
            state.S.logs.trade.data[1][sellerProfitCol].should.equal(state.S.logs.trade.data[1][priceCol]-1);
        });
        it('the profit log should have one entry equal to [1000-p,p-1]', function(){
            let p = state.S.logs.trade.data[1][tradeLogHeader.indexOf("price")];
            let correctProfits = [1000-p,p-1];
            state.S.logs.profit.data.length.should.be.equal(1);
            state.S.logs.profit.data.should.deepEqual([correctProfits]);
        }); 
        it('the ohlc log should have header plus one entry, with all price stats equal to single trade price', function(){
            let p = state.S.logs.trade.data[1][tradeLogHeader.indexOf("price")];
            let correctOHLC = {
                period: 1,
                open: p,
                high: p,
                low: p,
                close: p,
                volume: 1,
                p25: p,
                median: p,
                p75: p,
                mean: p,
                gini: gini(state.S.logs.profit.last)
            };
            state.S.logs.ohlc.data.length.should.equal(2);
            state.S.logs.ohlc.header.forEach(function(prop){
                if (prop in correctOHLC){
                    state.S.logs.ohlc.lastByKey(prop).should.be.approximately(correctOHLC[prop],0.000001);
                }
            });
        });
        it('the effalloc log should have header plus one entry, [1,100]', function(){
            state.S.logs.effalloc.data.length.should.equal(2);
            state.S.logs.effalloc.data[1].should.deepEqual([1,100]);
        });
    }

    describe('runPeriod()', function(){

        /* runPeriod(true) is synchronous */

        let mySim = new Simulation(configSingleUnitTrade);
        let sim = mySim.runPeriod(true);
        it('should modify in place and return the original simulation object', function(){
            assert.ok(mySim===sim);
        });
        testsForConfigSingleUnitTrade({S:mySim});
    });

    describe('runPeriod() runs asynchronously', function(){
        describe('and returns a promise ', function(){
            it('order logs should have length 1 (header)', function(done){
                let mySim = new Simulation(configSingleUnitTrade);
                (mySim
                 .runPeriod()
                 .then(()=>(done()))
                );
                mySim.logs.buyorder.data.length.should.equal(1);
                mySim.logs.sellorder.data.length.should.equal(1);
            });
        });
        describe('when done should pass same tests as runPeriod()', function(){
            let state = {};
            beforeEach(function(done){
                let mySim = new Simulation(configSingleUnitTrade);
                mySim.runPeriod().then(function(S){
                    state.S = S;
                    done();
                });
            });
            testsForConfigSingleUnitTrade(state);
        });
    });
    
    function testsForRunSimulationSingleTradeTenPeriods(state){
        it('.pool agent ids should be [1,2]', function(){
            state.S.pool.agents.map((a)=>(a.id)).should.deepEqual([1,2]);
        });
        it('.buyersPool agent ids should be [1]', function(){
            state.S.buyersPool.agents.map((a)=>(a.id)).should.deepEqual([1]);
        });
        it('.sellersPool agent ids should be [2]', function(){
            state.S.sellersPool.agents.map((a)=>(a.id)).should.deepEqual([2]);
        });
        it('.period should be 10', function(){
            state.S.period.should.equal(10);
        });
        it('should have property xMarket -- an instance of Market', function(){
            state.S.should.have.property('xMarket');
            state.S.xMarket.should.be.instanceOf(MEC.Market);
        });
        it('the buy and sell order logs should have between 10 orders and 1000 orders', function(){

            /* 10 because we need 10 orders each side for 10 trades, 1000 tops is ad hoc but unlikely to be exceeded */ 

            state.S.logs.buyorder.data.length.should.be.within(10,1000);
            state.S.logs.sellorder.data.length.should.be.within(10,1000);
        });
        it('tp should equal t % periodDuration in all logs having t and tp fields', function(){
            let tested = 0;
            (Object
             .keys(state.S.logs)
             .filter(function(log){ 
                 let header = state.S.logs[log].data[0];
                 return (header.includes('t')) && (header.includes('tp'));
             })
             .forEach(function(log){
                 let data = state.S.logs[log].data;
                 let tCol  = data[0].indexOf('t');
                 let tpCol = data[0].indexOf('tp');
                 let i,l,row;
                 for(i=1,l=data.length;i<l;++i){
                     row = data[i];
                     row[tpCol].should.be.type('number');
                     row[tCol].should.be.type('number');
                     row[tpCol].should.equal(row[tCol] % state.S.periodDuration);
                     if (row[tCol]!==row[tpCol]) tested++;
                 }
             })
            );
            tested.should.be.above(9);
        });
        it('the trade log should have 11 entries, the header row plus 10 trades, exactly 1 trade per period', function(){
            state.S.logs.trade.data.length.should.equal(11);
            state.S.logs.trade.data[0].should.deepEqual(tradeLogHeader);
            state.S.logs.trade.data.forEach(function(row,i){ if(i>0) row[0].should.equal(i); });
        }); 
        it('the period profit log should have 10 entries, each with two positive numbers that sum to 999', function(){
            state.S.logs.profit.data.forEach(function(row){
                row[0].should.be.above(0);
                row[1].should.be.above(0);
                assert.equal(row[0]+row[1],999);
            });
        });
        it('the ohlc log should have 11 entries, header + 1 trade per period', function(){
            state.S.logs.ohlc.data.length.should.equal(11);
        });
        it('the ohlc log data should agree with the trade log data', function(){ 
            let priceCol = tradeLogHeader.indexOf('price'),periodCol = tradeLogHeader.indexOf('period');
            // use .slice(1) to copy trade log with header row omitted
            let altOHLC = state.S.logs.trade.data.slice(1).map(
                function(row){
                    const p = row[priceCol];
                    let correctOHLC = {
                        period: row[periodCol],
                        open: p,
                        high: p,
                        low: p,
                        close: p,
                        volume: 1,
                        p25: p,
                        median: p,
                        p75: p,
                        mean: p,
                        sd: 0,
                        gini: gini(state.S.logs.profit.data[row[periodCol]-1])
                    };
                    return state.S.logs.ohlc.header.map(function(prop){ return correctOHLC[prop]; });
                });
            state.S.logs.ohlc.header.forEach(function(prop,i){
                for(let j=1,l=11;j<l;++j){
                    state.S.logs.ohlc.data[j][i].should.be.approximately(altOHLC[j-1][i],0.000001,"row "+j+" "+prop);
                }
            });
        });
        it('the effalloc log should have 11 entries, header + 1 per period, showing eff=100 percent', function(){
            state.S.logs.effalloc.data.length.should.equal(11);
            state.S.logs.effalloc.data.slice(1).should.deepEqual([[1,100],[2,100],[3,100],[4,100],[5,100],[6,100],[7,100],[8,100],[9,100],[10,100]]);
        });
    }

    describe('runSimulation with 10 periods of single unit trade scenario, synchronous', function(){
        let config = Object.assign({}, configSingleUnitTrade, {periods:10});
        let S = new Simulation(config).run({sync:true});
        testsForRunSimulationSingleTradeTenPeriods({S});
    }); 

    describe('run Simulation with 10 periods of single unit trade scenario, asyncrhonous', function(){
        let config = Object.assign({}, configSingleUnitTrade, {periods:10});
        describe('order log should be header only', function(){
            it('order logs should have length 1', function(done){
                let S = new Simulation(config);
                S.run().then(function(){ done(); }).catch(function(e){ throw e;});
                S.logs.buyorder.data.length.should.equal(1);
                S.logs.sellorder.data.length.should.equal(1);
            });
        });
        describe('when done should pass same tests as above ', function(){
            let state = {};
            beforeEach(function(done){
                new Simulation(config).run().then(function(S){
                    state.S = S;
                    done();
                }, function(e){ assert.ok(false, e); });
            });
            testsForRunSimulationSingleTradeTenPeriods(state);
        });
    });

    describe('deadline: run Simulation sync:true with immediate deadline, request 10 periods of single unit trade scenario only yields one period', function(){
        let config = Object.assign({}, configSingleUnitTrade, {periods:10});
        let S = new Simulation(config).run({sync:true, deadline: Date.now()});
        it("sim.config.periods should be reduced to 1 period", function(){
            S.config.periods.should.equal(1);
        });
        it('sim.config.periodsRequested should equal 10', function(){
            S.config.periodsRequested.should.equal(10);
        });
    });

    describe('deadline: run Simulation sync:false with immediate deadline, request 10 periods also runs one period', function(){
        let config = Object.assign({}, configSingleUnitTrade, {periods:10});
        let S;
        before(function(done){
            S = new Simulation(config);
            S.run({sync:false, deadline: Date.now()}).then(()=>(done()), (e)=>(done(e)));
        });
        it("sim.config.periods should be reduced to 1 period", function(){
            S.config.periods.should.equal(1);
        });
        it('sim.config.periodsRequested should equal 10', function(){
            S.config.periodsRequested.should.equal(10);
        });
    });
    
    describe('runSimulation with three simulations of 10 periods of single unit trade scenario, asynchronous', function(){
        let configA = Object.assign({}, configSingleUnitTrade, {periods:10});
        let configB = Object.assign({}, configSingleUnitTrade, {periods:10});
        let configC = Object.assign({}, configSingleUnitTrade, {periods:10});
        describe('when done should pass same tests as above ', function(){
            let states=[{},{},{}];
            // run the setup once before all the tests, not before each test
            before(function(done){
                let count = 0;
                function callback(S){
                    states[count].S = S;
                    count++;
                    if (count===3){
                        done();
                    }
                }
                new Simulation(configA).run().then(callback);
                new Simulation(configB).run().then(callback);
                new Simulation(configC).run().then(callback);
            });
            it('should have distinct buyer agents for each simulation', function(){
                states[0].S.buyersPool.agents[0].should.not.equal(states[1].S.buyersPool.agents[0]);
                states[0].S.buyersPool.agents[0].should.not.equal(states[2].S.buyersPool.agents[0]);
                states[1].S.buyersPool.agents[0].should.not.equal(states[2].S.buyersPool.agents[0]);
            });
            it('should have distinct seller agents for each simulation', function(){
                states[0].S.sellersPool.agents[0].should.not.equal(states[1].S.sellersPool.agents[0]);
                states[0].S.sellersPool.agents[0].should.not.equal(states[2].S.sellersPool.agents[0]);
                states[1].S.sellersPool.agents[0].should.not.equal(states[2].S.sellersPool.agents[0]);
            });
            testsForRunSimulationSingleTradeTenPeriods(states[0]);
            testsForRunSimulationSingleTradeTenPeriods(states[1]);
            testsForRunSimulationSingleTradeTenPeriods(states[2]);
        });
    });

    describe('runSimulation with three simulations of 10 periods of single unit trade scenario, asynchronous, realtime 1.5 sec period', function(){
        let rt = {
            realtime:1,
            periodDuration: 1.5,
            buyerRate: 10,
            sellerRate: 10
        };
        let configA = Object.assign({}, configSingleUnitTrade, {periods:10}, rt);
        let configB = Object.assign({}, configSingleUnitTrade, {periods:10}, rt);
        let configC = Object.assign({}, configSingleUnitTrade, {periods:10}, rt);
        describe('when done should pass same tests as above ', function(){
            let states=[{},{},{}];
            let tInit = 0, tFinal = 0, countBefore=0;
            // run the setup once before all the tests, not before each test
            before(function(done){
                tInit = Date.now();
                countBefore++;
                let count = 0;
                function callback(S){
                    states[count].S = S;
                    count++;
                    if (count===3){
                        tFinal = Date.now();
                        done();
                    }
                }
                new Simulation(configA).run().then(callback);
                new Simulation(configB).run().then(callback);
                new Simulation(configC).run().then(callback);
            });
            it('should only run the before() function in the test one time', function(){
                countBefore.should.equal(1);
            });
            it('should finish the real time simulations in about 15 sec', function(){
                const tInterval = (tFinal - tInit)/1000.0;
                tInterval.should.be.within(15,18);
            });
            it('should have distinct buyer agents for each simulation', function(){
                states[0].S.buyersPool.agents[0].should.not.equal(states[1].S.buyersPool.agents[0]);
                states[0].S.buyersPool.agents[0].should.not.equal(states[2].S.buyersPool.agents[0]);
                states[1].S.buyersPool.agents[0].should.not.equal(states[2].S.buyersPool.agents[0]);
            });
            it('should have distinct seller agents for each simulation', function(){
                states[0].S.sellersPool.agents[0].should.not.equal(states[1].S.sellersPool.agents[0]);
                states[0].S.sellersPool.agents[0].should.not.equal(states[2].S.sellersPool.agents[0]);
                states[1].S.sellersPool.agents[0].should.not.equal(states[2].S.sellersPool.agents[0]);
            });
            testsForRunSimulationSingleTradeTenPeriods(states[0]);
            testsForRunSimulationSingleTradeTenPeriods(states[1]);
            testsForRunSimulationSingleTradeTenPeriods(states[2]);
        });
    });
});

describe('simulation with 200 buyers, 200 sellers, values 900...303, costs 100...697, various agent types, 10 periods', function(){
    const agents = ["ZIAgent","UnitAgent","OneupmanshipAgent","MidpointAgent","TruthfulAgent","KaplanSniperAgent","MedianSniperAgent"];
    const config100Bx100Sx10Periods = {
        L:1,
        H:1000,
        numberOfBuyers:200,
        numberOfSelles:200,
        buyerValues: new Array(200).fill(0).map((v,j)=>(900-3*j)),
        sellerCosts: new Array(200).fill(0).map((v,j)=>(100+3*j)),
        buyerAgentType: agents.slice(0),
        sellerAgentType: agents.slice(0),
        periods: 10,
        silent: 1,
        logToFileSystem: false,
        integer: true
    };
    const S = new Simulation(config100Bx100Sx10Periods).run({sync:true});
    const ids = S.pool.agents.map((a)=>(a.id));
    it('should complete 10 periods', function(){
        S.period.should.equal(10);
    });
    it('should have 400 ids [1,...,400]', function(){
        ids.length.should.equal(400);
        const expected = new Array(400).fill(0).map((v,j)=>(1+j));
        expected[0].should.equal(1);
        expected[399].should.equal(400);
        ids.should.deepEqual(expected);
    });
    it('should have 200 buyers with ids [1,2,...,200]', function(){
        S.numberOfBuyers.should.equal(200);
        S.buyersPool.agents.length.should.equal(200);
        const expected = new Array(200).fill(0).map((v,j)=>(1+j));
        expected[0].should.equal(1);
        expected[199].should.equal(200);
        S.buyersPool.agents.map((a)=>(a.id)).should.deepEqual(expected);
    });
    it('should have 200 sellers with ids [201,202,...,400]', function(){
        S.numberOfSellers.should.equal(200);
        S.sellersPool.agents.length.should.equal(200);
        const expected = new Array(200).fill(0).map((v,j)=>(201+j));
        expected[0].should.equal(201);
        expected[199].should.equal(400);
        S.sellersPool.agents.map((a)=>(a.id)).should.deepEqual(expected);
    });
    it('the agent types match the round robin type specification', function(){
        const al = agents.length;
        let testsCompleted = 0;
        [S.buyersPool.agents,S.sellersPool.agents].forEach((testAgentList)=>{
            testAgentList.forEach((testAgent,testAgentIndex)=>{
                const correctAgentTypeName = agents[testAgentIndex%al];
                const thisAgentTypeName = testAgent.constructor.name;
                thisAgentTypeName.should.equal(correctAgentTypeName);
                testsCompleted++;
            });
        });
        testsCompleted.should.equal(400);
    });

    it("all agents bid <= value in order log", function(){
        const [buyLimitPriceCol, valueCol] = ['buyLimitPrice','value'].map((s)=>(S.logs.buyorder.header.indexOf(s)));
        S.logs.buyorder.data.forEach((bo)=>{
            bo[buyLimitPriceCol].should.be.belowOrEqual(bo[valueCol]);
        });
    });

    it("all agents ask >= cost in order log", function(){
        const [sellLimitPriceCol, costCol] = ['sellLimitPrice','cost'].map((s)=>(S.logs.sellorder.header.indexOf(s)));
        S.logs.sellorder.data.forEach((so)=>{
            so[sellLimitPriceCol].should.be.aboveOrEqual(so[costCol]);
        });
    });

    it("in trade log: check bid<=value, ask>=cost, check for correct values and costs based on id, and profit correctly calculated", function(){
        const [
            priceCol,
            buyerAgentIdCol,
            buyerValueCol,
            buyerProfitCol,
            sellerAgentIdCol,
            sellerCostCol,
            sellerProfitCol] = [
                'price',
                'buyerAgentId',
                'buyerValue',
                'buyerProfit',
                'sellerAgentId',
                'sellerCost',
                'sellerProfit'].map((s)=>(S.logs.trade.header.indexOf(s)));
        const bAdj = +(S.buyersPool.agents[0].id);
        const sAdj = +(S.sellersPool.agents[0].id);
        S.logs.trade.data.forEach((trade,j)=>{
            if (j>0){
                const buyerSlot = trade[buyerAgentIdCol]-bAdj;
                const sellerSlot = trade[sellerAgentIdCol]-sAdj;
                trade[priceCol].should.be.belowOrEqual(trade[buyerValueCol]);
                trade[priceCol].should.be.aboveOrEqual(trade[sellerCostCol]);
                trade[buyerValueCol].should.equal(900-3*buyerSlot);
                trade[sellerCostCol].should.equal(100+3*sellerSlot);
                trade[buyerProfitCol].should.equal(trade[buyerValueCol]-trade[priceCol]);
                trade[sellerProfitCol].should.equal(trade[priceCol]-trade[sellerCostCol]);
            }
        });
    });

    it('the "TruthfulAgent" always sets bid = value ', function(){
        const al = agents.length;
        const truthfulBuyers = S.buyersPool.agents.filter((a,j)=>(agents[j%al]==="TruthfulAgent"));
        truthfulBuyers.length.should.be.above(10);
        const truthfulBuyerIds = truthfulBuyers.map((a)=>(a.id));
        const [
            idCol,
            buyLimitPriceCol,
            valueCol
        ] = ['id','buyLimitPrice','value'].map((s)=>(S.logs.buyorder.header.indexOf(s)));
        const ordersByTruthfulBuyers = S.logs.buyorder.data.filter((bo)=>(truthfulBuyerIds.includes(bo[idCol])));
        ordersByTruthfulBuyers.length.should.be.above(100);
        ordersByTruthfulBuyers.forEach((bo)=>{
            bo[buyLimitPriceCol].should.equal(bo[valueCol]);
        });
    });

    it('the "TruthfulAgent" always sets ask = cost ', function(){
        const al = agents.length;
        const truthfulSellers = S.sellersPool.agents.filter((a,j)=>(agents[j%al]==="TruthfulAgent"));
        truthfulSellers.length.should.be.above(10);
        const truthfulSellerIds = truthfulSellers.map((a)=>(a.id));
        const [
            idCol,
            sellLimitPriceCol,
            costCol
        ] = ['id','sellLimitPrice','cost'].map((s)=>(S.logs.sellorder.header.indexOf(s)));
        const ordersByTruthfulSellers = S.logs.sellorder.data.filter((so)=>(truthfulSellerIds.includes(so[idCol])));
        ordersByTruthfulSellers.length.should.be.above(100);
        ordersByTruthfulSellers.forEach((so)=>{
            so[sellLimitPriceCol].should.equal(so[costCol]);
        });
    });

    it('the "MedianSniperAgent" as Buyer always bids below the previous period median price when tp<900', function(){
        const al = agents.length;
        const medianSniperBuyers = S.buyersPool.agents.filter((a,j)=>(agents[j%al]==="MedianSniperAgent"));
        medianSniperBuyers.length.should.be.above(10);
        const medianSniperBuyerIds = medianSniperBuyers.map((a)=>(a.id));
        const ohlcMedianPriceCol = S.logs.ohlc.header.indexOf("median");
        const [periodCol,tpCol,idCol,buyLimitPriceCol] = ['period','tp','id','buyLimitPrice'].map((s)=>(S.logs.buyorder.header.indexOf(s)));
        const testedOrdersByMedianSniperBuyers = S.logs.buyorder.data.filter((bo)=>((medianSniperBuyerIds.includes(bo[idCol]) && (bo[tpCol]<900))));
        testedOrdersByMedianSniperBuyers.length.should.be.above(50);
        testedOrdersByMedianSniperBuyers.forEach((bo)=>{
            bo[buyLimitPriceCol].should.be.belowOrEqual(S.logs.ohlc.data[bo[periodCol]-1][ohlcMedianPriceCol]);
        });
    });

    it('the "MedianSniperAgent" as Seller always asks above the previous period median price when tp<900', function(){
        const al = agents.length;
        const medianSniperSellers = S.sellersPool.agents.filter((a,j)=>(agents[j%al]==="MedianSniperAgent"));
        medianSniperSellers.length.should.be.above(10);
        const medianSniperSellerIds = medianSniperSellers.map((a)=>(a.id));
        const ohlcMedianPriceCol = S.logs.ohlc.header.indexOf("median");
        const [periodCol,tpCol,idCol,sellLimitPriceCol] = ['period','tp','id','sellLimitPrice'].map((s)=>(S.logs.sellorder.header.indexOf(s)));
        const testedOrdersByMedianSniperSellers = S.logs.sellorder.data.filter((so)=>((medianSniperSellerIds.includes(so[idCol]) && (so[tpCol]<900))));
        testedOrdersByMedianSniperSellers.length.should.be.above(50);
        testedOrdersByMedianSniperSellers.forEach((so)=>{
            so[sellLimitPriceCol].should.be.aboveOrEqual(S.logs.ohlc.data[so[periodCol]-1][ohlcMedianPriceCol]);
        });
    });
    
    it('the ohlc log should have 11 entries', function(){
        S.logs.ohlc.data.length.should.equal(11);
    });
    it('the trade log should have greater than 1000 entries', function(){
        S.logs.trade.data.length.should.be.above(1000);
    });
    it('the ohlc log should agree with the trade log', function(){
        S.logs.ohlc.data.should.deepEqual(tradesToOHLC(S.logs.trade.data, ids));
    });
    it('the buy order log and sell order log should each have greater than 2000 entries', function(){
        S.logs.buyorder.data.length.should.be.above(2000);
        S.logs.sellorder.data.length.should.be.above(2000);
    });
    it('cloning the orders into a new simulation will produce identical results in logs', function(){
        const clone = new Simulation(config100Bx100Sx10Periods);
        clone.pool.agents.forEach((a,idx)=>{ a.id = S.pool.agents[idx].id; });
        clone.pool.agentsById = {};
        clone.pool.agents.forEach((a)=>{ clone.pool.agentsById[a.id] = a; }); 
        const orders = [].concat(S.logs.buyorder.data.slice(1),S.logs.sellorder.data.slice(1));
        const [orderTCol,
               orderIDCol,
               orderPeriodCol,
               orderBuyLimitPriceCol,
               orderSellLimitPriceCol
              ] = ['t',
                   'id',
                   'period',
                   'buyLimitPrice',
                   'sellLimitPrice'
                  ].map((s)=>S.logs.buyorder.header.indexOf(s));
        orders.sort((a,b)=>(+a[orderTCol]-b[orderTCol]));
        const periodOrders = new Array(10).fill(0).map(()=>([]));
        orders.forEach((o)=>{
            periodOrders[o[orderPeriodCol]-1].push(MEC.oa({
                t: o[orderTCol],
                id: o[orderIDCol],
                cancel: 1,
                q: 1,
                buyPrice: o[orderBuyLimitPriceCol],
                sellPrice: o[orderSellLimitPriceCol]
            }));
        });
        periodOrders.forEach((orderList,periodMinus1)=>{
            clone.period = 1+periodMinus1;
            clone.pool.initPeriod(clone.period);
            clone.xMarket.clear();
            orderList.forEach((order)=>{
                clone.xMarket.submit(order);
                while(clone.xMarket.process());
            });
            clone.pool.endPeriod();
            clone.logPeriod();
        });
        S.logs.ohlc.data.should.deepEqual(clone.logs.ohlc.data);
        S.logs.trade.data.should.deepEqual(clone.logs.trade.data);
    });    
});


