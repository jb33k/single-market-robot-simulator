/* eslint-env node, mocha */

import assert from 'assert';
import 'should';
import * as singleMarketRobotSimulator from '../src/index.js';
import * as MEC from 'market-example-contingent';
import * as MarketAgents from 'market-agents';

const {Log, Simulation, runSimulation} = singleMarketRobotSimulator;
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

function allTests(){


    function fakeFS(fsinfo){
        delete global.fs;
        global.fs = {
            openSync(fname){
                fsinfo.call = 'openSync';
                fsinfo.params = [fname];
                return 37363; // fake fd return
            },
            writeSync(fd, data){
                fsinfo.call = 'writeSync';
                fsinfo.params = [fd,  data];
            }
        };
    }

    describe('new Log() to data array', function(){
        
        it('should have an empty data array', function(){   
            let L = new Log();
            L.should.have.property('data');
            assert.ok(Array.isArray(L.data));
            L.data.length.should.equal(0);
        });
        it('should have .useFS false', function(){
            let L = new Log();
            assert.ok(!L.useFS);
        });
        it('should have .fd undefined', function(){
            let L = new Log();
            assert.ok(typeof(L.fd)==='undefined');
        });
    });


    describe('Log.write([1,2,3,4,5]) to data array ', function(){
        
        let L = new Log();
        L.data.length.should.equal(0);
        L.write([1,2,3,4,5]);

        it('should add the array [1,2,3,4,5] to the data array', function(){
            L.data.length.should.equal(1);
            L.data.should.deepEqual([[1,2,3,4,5]]);
        });
        it('should set .last to [1,2,3,4,5]', function(){
            L.last.should.deepEqual([1,2,3,4,5]);
        });
    });

    describe('Log.write(23) to data array', function(){
        
        let L = new Log();
        L.data.length.should.equal(0);
        L.write(23);

        it('should add the number 23 to the data array', function(){
            L.data.length.should.equal(1);
            L.data.should.deepEqual([23]);
        });
        
        it('should set .last to 23', function(){
            L.last.should.equal(23);
        });
    });

    describe('Log.write({a:23}) to data array', function(){
        
        it('should add the object {a:23} to the data array', function(){
            let L = new Log();
            L.data.length.should.equal(0);
            L.write({a:23});
            L.last.should.deepEqual({a:23});
            L.data.length.should.equal(1);
            L.data.should.deepEqual([{a:23}]);
        });
    });

    describe('Log.write(undefined) to data array', function(){
        
        it('should leave the data array unchanged', function(){
            let L = new Log();
            L.data.length.should.equal(0);
            L.write();
            L.write(undefined);
            L.data.length.should.equal(0);
            assert.ok(typeof(L.last)==='undefined');
        });
    });

    describe('new Log(filename) to fake fs', function(){
        
        it('should call openSync and not have a data array', function(){
            let fsinfo = {};
            fakeFS(fsinfo);
            let L = new Log('fakedata');
            L.should.not.have.property('data');
            fsinfo.call.should.equal('openSync');
            fsinfo.params.should.deepEqual(['fakedata']);
            delete global.fs;
        });
        it('should have .useFS true', function(){
            let fsinfo = {};
            fakeFS(fsinfo);
            let L = new Log('fakedata.csv');
            assert.ok(L.useFS);
            delete global.fs;
        });
        it('should have expected .fd', function(){
            let fsinfo = {};
            fakeFS(fsinfo);
            let L = new Log('fakedata');
            assert.ok(L.fd===37363);
            delete global.fs;
        });
    });

    describe('Log.write([1,2,3,4,5]) to fake fs', function(){
        
        it('should write "1,2,3,4,5" newline ', function(){
            let fsinfo = {};
            fakeFS(fsinfo);
            let L = new Log('fakedata');
            L.write([1,2,3,4,5]);
            L.last.should.deepEqual([1,2,3,4,5]);
            fsinfo.call.should.equal('writeSync');
            fsinfo.params.should.deepEqual([37363, "1,2,3,4,5\n"]);
            delete global.fs;
        });
    });

    describe('Log.write(23) to fake fs ', function(){
        
        it('should write "23" newline', function(){
            let fsinfo = {};
            fakeFS(fsinfo);
            let L = new Log('fakedata');
            L.write(23);
            L.last.should.equal(23);
            fsinfo.call.should.equal("writeSync");
            fsinfo.params.should.deepEqual([37363, "23\n"]);
            delete global.fs;
        });
    });

    describe('Log.write({a:23}) to fake fs ', function(){
        
        it('should write JSON string {"a":23} newline', function(){
            let fsinfo = {};
            fakeFS(fsinfo);
            let L = new Log('fakedata');
            L.write({a:23});
            L.last.should.deepEqual({a:23});
            fsinfo.call.should.equal("writeSync");
            fsinfo.params.should.deepEqual([37363, '{"a":23}\n']);
            delete global.fs;
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
        
        let configCostsExceedValues = {
            L:1,
            H:100,
            buyerValues: [10,9,8],
            sellerCosts: [20,40],
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
            let logsProps = ['trade','buyorder','sellorder','profit','ohlc','volume'];
            it('.logs should have properties '+logsProps.join(',')+' -- all instances of Log', function(){
                S.logs.should.have.properties(logsProps);
                logsProps.forEach(function(prop){ S.logs[prop].should.be.an.instanceOf(Log); });
            });
            it('trade, buyorder, sellorder, ohlc, volume logs have header rows; profit log is empty', function(){
                let withHeaderRow = ['trade','buyorder','sellorder','ohlc','volume'];
                withHeaderRow.forEach(function(prop){ S.logs[prop].data.length.should.equal(1); });
                S.logs.trade.data[0].should.deepEqual(tradeLogHeader);
                S.logs.buyorder.data[0].should.deepEqual(combinedOrderLogHeader);
                S.logs.sellorder.data[0].should.deepEqual(combinedOrderLogHeader);
                S.logs.profit.data.length.should.equal(0);
            });

            it('.pool should be an instance of Pool containing 5 (ZI) agents with .bidPrice and .askPrice functions',function(){
                S.pool.should.be.an.instanceOf(Pool); 
                S.pool.agents.length.should.equal(5);
                S.pool.agents.forEach(function(A){ 
                    A.should.be.an.instanceOf(ZIAgent).and.have.properties('bidPrice','askPrice');  
                });
            });
            it('.buyersPool should be an instance of Pool containing 3 agents', function(){
                S.buyersPool.should.be.an.instanceOf(Pool); 
                S.buyersPool.agents.length.should.equal(3);
            });
            it('.sellersPool should be an instance of Pool containing 2 agents', function(){
                S.sellersPool.should.be.an.instanceOf(Pool);
                S.sellersPool.agents.length.should.equal(2);
            });
            it('.period should be zero', function(){
                S.period.should.equal(0);
            });
            it('.periodDuration should be 1000 (default)', function(){
                S.periodDuration.should.equal(1000);
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
            it('the volume log should header row and one entry equal to [1,0]', function(){
                state.S.logs.volume.data.length.should.equal(2);
                state.S.logs.volume.data.should.deepEqual([['period','volume'],[1,0]]);
            });
            it('.logTrade({totalQ:2}) should throw because of single unit trade requirement', function(){
                function logTwoUnitTrade(){ state.S.logTrade({totalQ:2}); }
                logTwoUnitTrade.should.throw();
            });

        }

        describe('runPeriod()', function(){

            /* runPeriod() is synchronous */

            let mySim = new Simulation(configCostsExceedValues);
            let sim = mySim.runPeriod();
            it('should modify in place and return the original simulation object', function(){
                assert.ok(mySim===sim);
            });
            testsForConfigCostsExceedValues({S:mySim});
        });

        describe('runPeriod(function(e,sim){...}) runs asynchronously', function(){
            describe('because async runPeriod ', function(){
                it('immediate inspection of order logs should only have length 1 from header row', function(done){
                    let mySim = new Simulation(configCostsExceedValues);
                    mySim.runPeriod(function(){ done(); });
                    mySim.logs.buyorder.data.length.should.equal(1);
                    mySim.logs.sellorder.data.length.should.equal(1);
                });
            });
            describe('when done should pass same tests as runPeriod()', function(){
                let state = {};
                before(function(done){
                    let mySim = new Simulation(configCostsExceedValues);
                    function callback(e,S){
                        state.S = S;
                        done();
                    }
                    mySim.runPeriod(callback);
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
            it('should set .numberOfBuyers to 3', function(){
                S.numberOfBuyers.should.equal(1);
            });
            it('should set .numberOfSellers to 2', function(){
                S.numberOfSellers.should.equal(1);
            });
            it('should set .numberOfAgents to 5', function(){
                S.numberOfAgents.should.equal(2);
            });
            let logsProps = ['trade','buyorder','sellorder','profit','ohlc','volume'];
            it('.logs should have properties '+logsProps.join(',')+' -- all instances of Log', function(){
                S.logs.should.have.properties(logsProps);
                logsProps.forEach(function(prop){ S.logs[prop].should.be.an.instanceOf(Log); });
            });
            it('.pool should be an instance of Pool containing 2 (ZI) agents with .bidPrice and .askPrice functions',function(){
                S.pool.should.be.an.instanceOf(Pool);
                S.pool.agents.length.should.equal(2);
                S.pool.agents.forEach(function(A){ 
                    A.should.be.an.instanceOf(ZIAgent).and.have.properties('bidPrice','askPrice'); 
                });
            });
            it('.buyersPool should be an instance of Pool containing 1 agents', function(){
                S.buyersPool.should.be.an.instanceOf(Pool);
                S.buyersPool.agents.length.should.equal(1);
            });
            it('.sellersPool should be an instance of Pool containing 1 agents', function(){
                S.sellersPool.should.be.an.instanceOf(Pool);
                S.sellersPool.agents.length.should.equal(1);
            });
            it('.period should be zero', function(){
                S.period.should.equal(0);
            });
            it('.periodDuration should be 1000 (default)', function(){
                S.periodDuration.should.equal(1000);
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
            it('the ohlc log should have header plus one entry, with all 4 o,h,l,c elements equal to the trade price', function(){
                let p = state.S.logs.trade.data[1][tradeLogHeader.indexOf("price")];
                let correctOHLC = [state.S.period,p,p,p,p];
                state.S.logs.ohlc.data.length.should.equal(2);
                state.S.logs.ohlc.data[1].should.deepEqual(correctOHLC);
            });
            it('the volume log should have header plus one entry, [1,1]', function(){
                state.S.logs.volume.data.length.should.equal(2);
                state.S.logs.volume.data[1].should.deepEqual([1,1]);
            });
        }

        describe('runPeriod()', function(){

            /* runPeriod() is synchronous */

            let mySim = new Simulation(configSingleUnitTrade);
            let sim = mySim.runPeriod();
            it('should modify in place and return the original simulation object', function(){
                assert.ok(mySim===sim);
            });
            testsForConfigSingleUnitTrade({S:mySim});
        });

        describe('runPeriod(function(e,sim){...}) runs asynchronously', function(){
            describe('because async ', function(){
                it('order logs should have length 1 (header)', function(done){
                    let mySim = new Simulation(configSingleUnitTrade);
                    mySim.runPeriod(function(){ done(); });
                    mySim.logs.buyorder.data.length.should.equal(1);
                    mySim.logs.sellorder.data.length.should.equal(1);
                });
            });
            describe('when done should pass same tests as runPeriod()', function(){
                let state = {};
                beforeEach(function(done){
                    let mySim = new Simulation(configSingleUnitTrade);
                    mySim.runPeriod(function(e,S){
                        state.S = S;
                        done();
                    });
                });
                testsForConfigSingleUnitTrade(state);
            });
        });
        function testsForRunSimulationSingleTradeTenPeriods(state){
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
                     return (header.indexOf('t')>=0) && (header.indexOf('tp')>=0);
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
            it('the ohlc log should have 11 entries, header + 1 trade per period, matching trade log', function(){
                let priceCol = tradeLogHeader.indexOf('price'),periodCol = tradeLogHeader.indexOf('period');
                // use .slice(1) to copy trade log with header row omitted
                let altOHLC = state.S.logs.trade.data.slice(1).map(
                    function(row){ 
                        let period = row[periodCol];
                        let price  = row[priceCol];
                        // o,h,l,c equal because it is a single unit trade scenario
                        return [period,price,price,price,price];
                    });
                state.S.logs.ohlc.data.length.should.equal(11);
                state.S.logs.ohlc.data.slice(1).should.deepEqual(altOHLC);          
            });
            it('the volume log should have 11 entries, header + 1 per period, showing 1 unit traded', function(){
                state.S.logs.volume.data.length.should.equal(11);
                state.S.logs.volume.data.slice(1).should.deepEqual([[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[7,1],[8,1],[9,1],[10,1]]);
            });
        }

        describe('runSimulation with 10 periods of single unit trade scenario, synchronous', function(){
            let config = Object.assign({}, configSingleUnitTrade, {periods:10});
            let S = runSimulation(config);
            testsForRunSimulationSingleTradeTenPeriods({S});
        }); 

        describe('runSimulation with 10 periods of single unit trade scenario, asyncrhonous', function(){
            let config = Object.assign({}, configSingleUnitTrade, {periods:10});
            describe(' -- because runSimulation(config,callback) returns immediately, order log should be header only', function(){
                it('order logs should have length 1', function(done){
                    let S = runSimulation(config, function(){ done();});
                    S.logs.buyorder.data.length.should.equal(1);
                    S.logs.sellorder.data.length.should.equal(1);
                });
            });
            describe('when done should pass same tests as above ', function(){
                let state = {};
                beforeEach(function(done){
                    runSimulation(config,function(e,S){
                        state.S = S;
                        done();
                    });
                });
                testsForRunSimulationSingleTradeTenPeriods(state);
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
                    function callback(e,S){
                        states[count].S = S;
                        count++;
                        if (count===3){
                            done();
                        }
                    }
                    runSimulation(configA, callback);
                    runSimulation(configB, callback);
                    runSimulation(configC, callback);
                });
                testsForRunSimulationSingleTradeTenPeriods(states[0]);
                testsForRunSimulationSingleTradeTenPeriods(states[1]);
                testsForRunSimulationSingleTradeTenPeriods(states[2]);
            });
        });
    });

    
}

allTests();
