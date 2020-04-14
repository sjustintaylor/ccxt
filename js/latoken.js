'use strict';

//  ---------------------------------------------------------------------------

const Exchange = require ('./base/Exchange');
const { ExchangeError, ArgumentsRequired, InvalidNonce, OrderNotFound, InvalidOrder, DDoSProtection, BadRequest, AuthenticationError } = require ('./base/errors');
const { ROUND } = require ('./base/functions/number');

//  ---------------------------------------------------------------------------

module.exports = class latoken extends Exchange {
    describe () {
        return this.deepExtend (super.describe (), {
            'id': 'latoken',
            'name': 'Latoken',
            'countries': [ 'KY' ], // Cayman Islands
            'version': 'v2',
            'rateLimit': 2000,
            'certified': false,
            'userAgent': this.userAgents['chrome'],
            'has': {
                'CORS': false,
                'publicAPI': true,
                'privateAPI': true,
                'cancelOrder': true,
                'cancelAllOrders': false,
                'createMarketOrder': false,
                'createOrder': true,
                'fetchBalance': true,
                'fetchCanceledOrders': true,
                'fetchClosedOrders': true,
                'fetchCurrencies': true,
                'fetchMyTrades': true,
                'fetchOpenOrders': true,
                'fetchOrder': true,
                'fetchOrdersByStatus': true,
                'fetchOrderBook': true,
                'fetchOrders': true,
                'fetchTicker': true,
                'fetchTickers': true,
                'fetchTime': true,
                'fetchTrades': true,
                'fetchOHLCV': false,
            },
            'urls': {
                'logo': 'https://user-images.githubusercontent.com/1294454/61511972-24c39f00-aa01-11e9-9f7c-471f1d6e5214.jpg',
                'api': 'https://api.latoken.com',
                'www': 'https://latoken.com',
                'doc': [
                    'https://api.latoken.com',
                ],
            },
            'api': {
                'public': {
                    'get': [
                        'time',
                        'pair',
                        'currency/available',
                        'currency',
                        'marketOverview/orderbook/{market_pair}',
                        'ticker/{base}/{quote}',
                        'ticker',
                        'marketOverview/ticker',
                        'trade/history/{currency}/{quote}',
                    ],
                },
                'private': {
                    'get': [
                        'auth/account',
                        'auth/trade/pair/{currency}/{quote}',
                        'auth/order/pair/{currency}/{quote}/active',
                        'auth/order/pair/{currency}/{quote}',
                        'auth/order/getOrder/{id}',
                        'auth/trade/pair/{currency}/{quote}',
                    ],
                    'post': [
                        'auth/order/place',
                        'auth/order/cancel',
                    ],
                },
            },
            'fees': {
                'trading': {
                    'tierBased': false,
                    'percentage': true,
                    'maker': 0.1 / 100,
                    'taker': 0.1 / 100,
                },
            },
            'commonCurrencies': {
                'MT': 'Monarch',
                'TSL': 'Treasure SL',
            },
            'options': {
                'createOrderMethod': 'private_post_order_new', // private_post_order_test_order
            },
            'exceptions': {
                'exact': {
                    'Signature or ApiKey is not valid': AuthenticationError,
                    'Request is out of time': InvalidNonce,
                    'Symbol must be specified': BadRequest,
                },
                'broad': {
                    'Request limit reached': DDoSProtection,
                    'Pair': BadRequest,
                    'Price needs to be greater than': InvalidOrder,
                    'Amount needs to be greater than': InvalidOrder,
                    'The Symbol field is required': InvalidOrder,
                    'OrderType is not valid': InvalidOrder,
                    'Side is not valid': InvalidOrder,
                    'Cancelable order whit': OrderNotFound,
                    'Order': OrderNotFound,
                },
            },
        });
    }

    nonce () {
        return this.milliseconds ();
    }

    async fetchTime (params = {}) {
        const response = await this.publicGetTime (params);
        //
        //     {
        //         "time": "2019-04-18T9:00:00.0Z",
        //         "unixTimeSeconds": 1555578000,
        //         "unixTimeMiliseconds": 1555578000000
        //     }
        //
        return this.safeInteger (response, 'serverTime');
    }

    async fetchMarkets (params = {}) {
        const response = await this.publicGetPair (params);
        const currencies = await this.publicGetCurrency ();
        //
        //     [
        //      {
        //          "id": "263d5e99-1413-47e4-9215-ce4f5dec3556",
        //          "status": "PAIR_STATUS_ACTIVE",
        //          "baseCurrency": "6ae140a9-8e75-4413-b157-8dd95c711b23",
        //          "quoteCurrency": "23fa548b-f887-4f48-9b9b-7dd2c7de5ed0",
        //          "priceTick": "0.010000000",
        //          "priceDecimals": 2,
        //          "quantityTick": "0.010000000",
        //          "quantityDecimals": 2,
        //          "costDisplayDecimals": 3,
        //          "created": 1571333313871
        //      }
        //     ]
        //
        const result = [];
        for (let i = 0; i < response.length; i++) {
            const market = response[i];
            // the exchange shows them inverted
            const baseId = this.safeString (market, 'baseCurrency');
            const quoteId = this.safeString (market, 'quoteCurrency');
            const baseCode = this.getCurrencyCode (baseId, currencies);
            const quoteCode = this.getCurrencyCode (quoteId, currencies);
            const numericId = undefined;
            // const base = this.safeCurrencyCode (baseCode); // Not sure about this
            // const quote = this.safeCurrencyCode (quoteCode);
            const symbol = baseCode + '/' + quoteCode;
            const id = baseCode + '_' + quoteCode;
            const active = (market['status'] === 'PAIR_STATUS_ACTIVE') ? true : false;
            const precision = {
                'price': this.safeInteger (market, 'priceDecimals'),
                'amount': this.safeInteger (market, 'quantityDecimals'),
            };
            const limits = {
                'amount': {
                    'min': this.safeFloat (market, 'quantityTick'),
                    'max': undefined,
                },
                'price': {
                    'min': this.safeFloat (market, 'priceTick'),
                    'max': undefined,
                },
                'cost': {
                    'min': undefined,
                    'max': undefined,
                },
            };
            result.push ({
                'id': id.toUpperCase (),
                'numericId': numericId,
                'info': market,
                'symbol': symbol,
                'base': baseCode,
                'quote': quoteCode,
                'baseId': baseId,
                'quoteId': quoteId,
                'active': active, // assuming true
                'precision': precision,
                'limits': limits,
            });
        }
        return result;
    }

    getCurrencyCode (currencyId, currencies) {
        let code = '';
        for (let i = 0; i < currencies.length; i++) {
            if (currencies[i]['id'] === currencyId) {
                const currencyId = currencies[i]['tag'];
                code = this.safeCurrencyCode (currencyId);
                break;
            }
        }
        return code;
    }

    async fetchCurrencies (params = {}) {
        const response = await this.publicGetCurrencyAvailable (params);
        //
        //     [
        //         {
        //             "id": "d663138b-3ec1-436c-9275-b3a161761523",
        //             "status": "CURRENCY_STATUS_ACTIVE",
        //             "type": "CURRENCY_TYPE_CRYPTO",
        //             "name": "Latoken",
        //             "tag": "LA",
        //             "description": "LATOKEN is a cutting edge exchange which makes investing and payments easy and safe worldwide.",
        //             "logo": "https://static.dev-mid.nekotal.tech/icons/color/la.svg",
        //             "decimals": 9,
        //             "created": 1571333563712
        //         }
        //     ]
        //
        const result = {};
        for (let i = 0; i < response.length; i++) {
            const currency = response[i];
            const id = this.safeString (currency, 'tag');
            const numericId = undefined;
            const code = this.safeCurrencyCode (id);
            const precision = this.safeInteger (currency, 'decimals');
            const fee = undefined;
            const active = (currency['status'] === 'CURRENCY_STATUS_ACTIVE') ? true : false;
            result[code] = {
                'id': id,
                'numericId': numericId,
                'code': code,
                'info': currency,
                'name': code,
                'active': active,
                'fee': fee,
                'precision': precision,
                'limits': {
                    'amount': {
                        'min': undefined,
                        'max': undefined,
                    },
                    'price': {
                        'min': undefined,
                        'max': undefined,
                    },
                    'cost': {
                        'min': undefined,
                        'max': undefined,
                    },
                    'withdraw': {
                        'min': undefined,
                        'max': undefined,
                    },
                },
            };
        }
        return result;
    }

    calculateFee (symbol, type, side, amount, price, takerOrMaker = 'taker', params = {}) {
        const market = this.markets[symbol];
        let key = 'quote';
        const rate = market[takerOrMaker];
        let cost = amount * rate;
        let precision = market['precision']['price'];
        if (side === 'sell') {
            cost *= price;
        } else {
            key = 'base';
            precision = market['precision']['amount'];
        }
        cost = this.decimalToPrecision (cost, ROUND, precision, this.precisionMode);
        return {
            'type': takerOrMaker,
            'currency': market[key],
            'rate': rate,
            'cost': parseFloat (cost),
        };
    }

    async fetchBalance (params = {}) {
        await this.loadMarkets ();
        const response = await this.privateGetAuthAccount (params);
        const allCurrencies = await this.publicGetCurrencyAvailable ();
        //
        //     [
        //       {
        //          "id": "1e200836-a037-4475-825e-f202dd0b0e92",
        //          "status": "ACCOUNT_STATUS_ACTIVE",
        //          "type": "ACCOUNT_TYPE_WALLET",
        //          "timestamp": 1566408522980,
        //          "currency": "6ae140a9-8e75-4413-b157-8dd95c711b23",
        //          "available": "898849.3300",
        //          "blocked": "4581.9510"
        //      }
        //     ]
        //
        const result = {
            'info': response,
        };
        for (let i = 0; i < response.length; i++) {
            const balance = response[i];
            const currency = this.safeString (balance, 'currency');
            const currencyCode = this.getCurrencyCode (currency, allCurrencies);
            const code = this.safeCurrencyCode (currencyCode);
            const free = this.safeFloat (balance, 'available');
            const blocked = this.safeFloat (balance, 'blocked');
            const account = {
                'free': free,
                'used': blocked,
                'total': this.sum (free, blocked),
            };
            result[code] = account;
        }
        return this.parseBalance (result);
    }

    async fetchOrderBook (symbol, limit = undefined, params = {}) {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const request = {
            'market_pair': market['id'],
            'depth': 10,
        };
        if (limit !== undefined) {
            request['depth'] = limit; // default 10, max 500
        }
        const response = await this.publicGetMarketOverviewOrderbookMarketPair (this.extend (request, params));
        //
        // {
        //   "bids":
        //      [
        //          [
        //          "12462000",
        //          "0.04548320"
        //          ],
        //          []
        //     ],
        //   "asks":
        //      [
        //          [],
        //          []
        //      ],
        //     "timestamp": "1566359163123"
        // }
        //
        const timestamp = this.iso8601 (response['timestamp']);
        const bids = [];
        const asks = [];
        for (let i = 0; i < response['bids'].length; i++) {
            bids.push ([ response['bids'][i][0], response['bids'][i][1] ]);
        }
        for (let i = 0; i < response['asks'].length; i++) {
            asks.push ([ response['asks'][i][0], response['asks'][i][1] ]);
        }
        const newResponse = {
            'bids': bids,
            'asks': asks,
            'timestamp': timestamp,
        };
        return this.parseOrderBook (newResponse, timestamp, 'bids', 'asks');
    }

    parseTicker (symbol, ticker, market = undefined) {
        //      {
        //          "symbol": "ETH/USDT",
        //          "baseCurrency": "23fa548b-f887-4f48-9b9b-7dd2c7de5ed0",
        //          "quoteCurrency": "d721fcf2-cf87-4626-916a-da50548fe5b3",
        //          "volume24h": "450.29",
        //          "volume7d": "3410.23",
        //          "change24h": "-5.2100",
        //          "change7d": "1.1491",
        //          "lastPrice": "10034.14"
        //      }
        //
        let close = this.safeFloat (ticker, 'lastPrice');
        if (!close) {
            close = 0;
        }
        let change = 0;
        let percentageChange = this.safeFloat (ticker, 'change24h');
        if (percentageChange !== 0) {
            change = close + (close * percentageChange);
        }
        percentageChange = percentageChange ? percentageChange : 0;
        const timestamp = this.nonce ();
        return {
            'symbol': symbol,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'low': undefined,
            'high': undefined,
            'bid': 0,
            'bidVolume': undefined,
            'ask': close,
            'askVolume': undefined,
            'vwap': undefined,
            'open': undefined,
            'close': close,
            'last': close,
            'previousClose': undefined,
            'change': change,
            'percentage': percentageChange,
            'average': undefined,
            'baseVolume': undefined,
            'quoteVolume': this.safeFloat (ticker, 'volume24h'),
            'info': ticker,
        };
    }

    async fetchTicker (symbol, params = {}) {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const marketID = market['id'];
        const id = marketID.split ('_');
        const request = {
            'base': id[0],
            'quote': id[1],
        };
        const response = await this.publicGetTickerBaseQuote (this.extend (request, params));
        return this.parseTicker (symbol, response, market);
    }

    async fetchTickers (symbols = undefined, params = {}) {
        await this.loadMarkets ();
        const response = await this.publicGetTicker (params);
        //
        //  [
        // {
        //     "symbol": "ETH/USDT",
        //     "baseCurrency": "23fa548b-f887-4f48-9b9b-7dd2c7de5ed0",
        //     "quoteCurrency": "d721fcf2-cf87-4626-916a-da50548fe5b3",
        //     "volume24h": "450.29",
        //     "volume7d": "3410.23",
        //     "change24h": "-5.2100",
        //     "change7d": "1.1491",
        //     "lastPrice": "10034.14"
        // }
        //  ]
        //
        const result = {};
        for (let i = 0; i < response.length; i++) {
            const symbol = response[i]['symbol'];
            const ticker = this.parseTicker (symbol, response[i]);
            result[symbol] = ticker;
        }
        return result;
    }

    parseTrade (trade, market = undefined) {
        //
        // fetchTrades (public)
        //
        //     [
        // {
        //     id: '1d6443bf-0728-4023-b1c5-1fb8f813408b',
        //     isMakerBuyer: false,
        //     baseCurrency: '92151d82-df98-4d88-9a4d-284fa9eca49f',
        //     quoteCurrency: '0c3a106d-bde3-4c13-a26e-3fd2394529e5',
        //     price: '7181.43',
        //     quantity: '0.0284',
        //     cost: '203.952612',
        //     timestamp: 1586301661310,
        //     makerBuyer: false
        //   },
        //     ]
        //
        const type = undefined;
        let timestamp = this.safeInteger2 (trade, 'timestamp', 'time');
        if (timestamp !== undefined) {
            // 03 Jan 2009 - first block
            if (timestamp < 1230940800000) {
                timestamp *= 1000;
            }
        }
        const price = this.safeFloat (trade, 'price');
        const amount = this.safeFloat (trade, 'quantity');
        let side = undefined;
        const direction = this.safeString (trade, 'makerBuyer');
        let takerOrMaker = undefined;
        if (direction) {
            side = 'sell';
            takerOrMaker = 'maker';
        } else if (!direction) {
            side = 'buy';
            takerOrMaker = 'taker';
        }
        let cost = undefined;
        if (amount !== undefined) {
            if (price !== undefined) {
                cost = amount * price;
            }
        }
        let symbol = undefined;
        if (market !== undefined) {
            symbol = market['symbol'];
        }
        const id = this.safeString (trade, 'id');
        const feeCost = this.safeFloat (trade, 'commission');
        let fee = undefined;
        if (feeCost !== undefined) {
            fee = {
                'cost': feeCost,
                'currency': undefined,
            };
        }
        return {
            'info': trade,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'symbol': symbol,
            'id': id,
            'order': undefined,
            'type': type,
            'takerOrMaker': takerOrMaker,
            'side': side,
            'price': price,
            'amount': amount,
            'cost': cost,
            'fee': fee,
        };
    }

    async fetchTrades (symbol, since = undefined, limit = undefined, params = {}) {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const request = {
            'currency': market['base'],
            'quote': market['quote'],
        };
        if (limit !== undefined) {
            request['limit'] = limit; // default 50, max 100
        }
        const response = await this.publicGetTradeHistoryCurrencyQuote (this.extend (request, params));
        //
        //     [
        // {
        //     id: '1d6443bf-0728-4023-b1c5-1fb8f813408b',
        //     isMakerBuyer: false,
        //     baseCurrency: '92151d82-df98-4d88-9a4d-284fa9eca49f',
        //     quoteCurrency: '0c3a106d-bde3-4c13-a26e-3fd2394529e5',
        //     price: '7181.43',
        //     quantity: '0.0284',
        //     cost: '203.952612',
        //     timestamp: 1586301661310,
        //     makerBuyer: false
        //   },
        //     ]
        //
        // const result = [];
        // const len = Object.keys (response);
        // for (let i = 0; i < len.length; i++) {
        //     result.push (this.parseTrade (response[i], market, since, limit));
        // }
        return this.parseTrades (response, market, since, limit);
    }

    async fetchMyTrades (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        if (symbol === undefined) {
            throw new ArgumentsRequired (this.id + ' fetchMyTrades requires a symbol argument');
        }
        await this.loadMarkets ();
        const market = this.market (symbol);
        const request = {
            'currency': market['base'],
            'quote': market['quote'],
        };
        const response = await this.privateGetAuthTradePairCurrencyQuote (this.extend (request, params));
        //
        //     [
        //      {
        //          "id": "92609cf4-fca5-43ed-b0ea-b40fb48d3b0d",
        //          "direction": "TRADE_DIRECTION_BUY",
        //          "baseCurrency": "6ae140a9-8e75-4413-b157-8dd95c711b23",
        //          "quoteCurrency": "d721fcf2-cf87-4626-916a-da50548fe5b3",
        //          "price": "10000.00",
        //          "quantity": "18.0000",
        //          "cost": "180000.000",
        //          "timestamp": 1568396094704
        //      }
        //     ]
        //
        return this.parseTrades (response, market, since, limit);
    }

    parseOrderStatus (status) {
        const statuses = {
            'active': 'open',
            'placed': 'open',
            'filled': 'closed',
            'closed': 'closed',
            'cancelled': 'canceled',
        };
        return this.safeString (statuses, status, status);
    }

    parseOrder (order, market = undefined) {
        //
        //  fetchOrder
        // {
        //     "id": "12609cf4-fca5-43ed-b0ea-b40fb48d3b0d",
        //     "status": "CLOSED",
        //     "side": "BUY",
        //     "condition": "GTC",
        //     "type": "LIMIT",
        //     "baseCurrency": "3092b810-c39f-47ba-8c5f-a8ca3bd8902c",
        //     "quoteCurrency": "4092b810-c39f-47ba-8c5f-a8ca3bd0004c",
        //     "clientOrderId": "myOrder",
        //     "price": "100.0",
        //     "quantity": "1000.0",
        //     "cost": "100000.0",
        //     "filled": "230.0",
        //     "trader": "12345678-fca5-43ed-b0ea-b40fb48d3b0d",
        //     "timestamp": 3800014433
        //   }
        //
        const id = this.safeString (order, 'id');
        const timestamp = this.safeTimestamp (order, 'timestamp');
        // Added upstream
        const marketId = this.safeString (order, 'marketId');
        const symbol = marketId.replace ('_', '/');
        // if (marketId in this.markets_by_id) {
        //     market = this.markets_by_id[marketId];
        // }
        // if (market !== undefined) {
        //     symbol = market['symbol'];
        // }
        const side = this.safeString (order, 'side');
        const type = this.safeString (order, 'type');
        const price = this.safeFloat (order, 'price');
        const amount = this.safeFloat (order, 'quantity');
        const filled = this.safeFloat (order, 'filled');
        let remaining = undefined;
        if (amount !== undefined) {
            if (filled !== undefined) {
                remaining = amount - filled;
            }
        }
        const originalStatus = this.safeString (order, 'status').toLowerCase ();
        const status = this.parseOrderStatus (originalStatus);
        let cost = undefined;
        if (filled !== undefined) {
            if (price !== undefined) {
                cost = filled * price;
            }
        }
        const timeFilled = this.safeTimestamp (order, 'timestamp');
        let lastTradeTimestamp = undefined;
        if ((timeFilled !== undefined) && (timeFilled > 0)) {
            lastTradeTimestamp = timeFilled;
        }
        const clientOrderId = this.safeString (order, 'clientOrderId');
        return {
            'id': id,
            'clientOrderId': clientOrderId,
            'info': order,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'lastTradeTimestamp': lastTradeTimestamp,
            'status': status,
            'symbol': symbol,
            'type': type,
            'side': side,
            'price': price,
            'cost': cost,
            'amount': amount,
            'filled': filled,
            'average': undefined,
            'remaining': remaining,
            'fee': undefined,
            'trades': undefined,
        };
    }

    async fetchOpenOrders (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        if (symbol === undefined) {
            throw new ArgumentsRequired (this.id + ' fetchOpenOrders requires a symbol argument');
        }
        await this.loadMarkets ();
        const market = this.market (symbol);
        const request = {
            'currency': market['baseId'],
            'quote': market['quoteId'],
        };
        const response = await this.privateGetAuthOrderPairCurrencyQuoteActive (request, params);
        //
        // [{
        //     "id": "92609cf4-fca5-43ed-b0ea-b40fb48d3b0d",
        //     "status": "PLACED",
        //     "side": "SELL",
        //     "condition": "GTC",
        //     "type": "LIMIT",
        //     "baseCurrency": "3092b810-c39f-47ba-8c5f-a8ca3bd8902c",
        //     "quoteCurrency": "4092b810-c39f-47ba-8c5f-a8ca3bd0004c",
        //     "clientOrderId": "myOrder",
        //     "price": "130.12",
        //     "quantity": "1000.0",
        //     "cost": "130120.00",
        //     "filled": "999.1",
        //     "trader": "12345678-fca5-43ed-b0ea-b40fb48d3b0d",
        //     "timestamp": 3800012333
        // }]
        //
        const marketId = market['base'] + '_' + market['quote'];
        const results = [];
        for (let i = 0; i < response.length; i++) {
            response[i]['marketId'] = marketId;
            results.push (this.parseOrder (response, market, since, limit));
        }
        return results;
        // return this.parseOrders (response, market, since, limit);
    }

    async fetchClosedOrders (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        return this.fetchOrdersByStatus ('filled', symbol, since, limit, params);
    }

    async fetchCanceledOrders (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        return this.fetchOrdersByStatus ('cancelled', symbol, since, limit, params);
    }

    async fetchOrdersByStatus (status, symbol = undefined, since = undefined, limit = undefined, params = {}) {
        if (symbol === undefined) {
            throw new ArgumentsRequired (this.id + ' fetchOrdersByStatus requires a symbol argument');
        }
        await this.loadMarkets ();
        const market = this.market (symbol);
        const request = {
            'limit': 100,
            'currency': market['baseId'],
            'quote': market['quoteId'],
        };
        if (limit !== undefined) {
            request['limit'] = limit;
        }
        const orders = this.privateGetAuthOrderPairCurrencyQuote (request, params);
        const results = [];
        const marketId = market['base'] + '_' + market['quote'];
        const parsedStatus = this.parseOrderStatus (status);
        for (let i = 0; i < orders.length; i++) {
            const originalStatus = orders[i]['status'].toLowerCase ();
            const orderStatus = this.parseOrderStatus (originalStatus);
            if (orderStatus === parsedStatus) {
                orders[i]['marketId'] = marketId;
                results.push (this.parseOrder (orders[i]));
            }
        }
        return results;
    }

    async fetchOrder (id, symbol = undefined, params = {}) {
        await this.loadMarkets ();
        const request = {
            'id': id,
        };
        const response = await this.privateGetAuthOrderGetOrderId (this.extend (request, params));
        //
        // {
        //     "id": "12609cf4-fca5-43ed-b0ea-b40fb48d3b0d",
        //     "status": "CLOSED",
        //     "side": "BUY",
        //     "condition": "GTC",
        //     "type": "LIMIT",
        //     "baseCurrency": "3092b810-c39f-47ba-8c5f-a8ca3bd8902c",
        //     "quoteCurrency": "4092b810-c39f-47ba-8c5f-a8ca3bd0004c",
        //     "clientOrderId": "myOrder",
        //     "price": "100.0",
        //     "quantity": "1000.0",
        //     "cost": "100000.0",
        //     "filled": "230.0",
        //     "trader": "12345678-fca5-43ed-b0ea-b40fb48d3b0d",
        //     "timestamp": 3800014433
        //   }
        //
        response['marketId'] = this.marketId (symbol);
        return this.parseOrder (response);
    }

    async fetchOrders (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        if (symbol === undefined) {
            throw new ArgumentsRequired (this.id + ' fetchOrders requires a symbol argument');
        }
        await this.loadMarkets ();
        const market = this.market (symbol);
        const request = {
            'limit': 100,
            'currency': market['baseId'],
            'quote': market['quoteId'],
        };
        if (limit !== undefined) {
            request['limit'] = limit;
        }
        const orders = this.privateGetAuthOrderPairCurrencyQuote (request, params);
        const results = [];
        const marketId = market['base'] + '_' + market['quote'];
        for (let i = 0; i < orders.length; i++) {
            orders[i]['marketId'] = marketId;
            results.push (this.parseOrder (orders[i]));
        }
        return results;
    }

    async createOrder (symbol, type, side, amount, price = undefined, params = {}) {
        await this.loadMarkets ();
        if (type !== 'limit' && type !== 'market') {
            throw new ExchangeError (this.id + ' allows limit or market orders only');
        }
        //
        // Payload
        // {
        //     "baseCurrency": "f7dac554-8139-4ff6-841f-0e586a5984a0",
        //     "quoteCurrency": "a5a7a7a9-e2a3-43f9-8754-29a02f6b709b",
        //     "side": "BID",
        //     "condition": "GTC",
        //     "type": "LIMIT",
        //     "clientOrderId": "my-wonderful-order-number-71566",
        //     "price": "10103.19",
        //     "quantity": "3.21",
        //     "timestamp": 1568185507
        //   }
        //
        const market = this.market (symbol);
        const base = market['baseId'];
        const quote = market['quoteId'];
        const request = {
            'type': type,
            'side': side,
            'condition': 'GTC',
            'baseCurrency': base,
            'quoteCurrency': quote,
            'price': this.priceToPrecision (symbol, price),
            'quantity': this.amountToPrecision (symbol, amount),
            'timestamp': this.nonce (),
        };
        const response = await this.privatePostAuthOrderPlace (this.extend (request, params));
        //
        // Response
        // {
        //     "id": "...",
        //     "message": "your request was successfully processed",
        //     "status": "SUCCESS",
        //     "error": "...",
        //     "errors": {
        //       "property1": "...",
        //       "property2": "..."
        //     }
        //   }
        //
        if (response['status'] !== 'SUCCESS') {
            throw new BadRequest (this.id + ' Exchange responded with: ' + response['error']);
        } else {
            return {
                'id': this.safeString (response, 'id'),
                'timestamp': request['timestamp'],
                'datetime': this.iso8601 (request['timestamp']),
                'lastTradeTimestamp': undefined,
                'status': 'open',
                'symbol': symbol,
                'type': type,
                'side': side,
                'price': price,
                'cost': undefined,
                'amount': amount,
                'filled': undefined,
                'average': undefined,
                'remaining': amount,
                'fee': undefined,
                'trades': undefined,
            };
        }
    }

    async cancelOrder (id, symbol = undefined, params = {}) {
        await this.loadMarkets ();
        const request = {
            'id': id,
        };
        const response = await this.privatePostAuthOrderCancel (this.extend (request, params));
        //
        // {
        //     "id": "12345678-1234-1244-1244-123456789012",
        //     "message": "your request was successfully processed",
        //     "status": "SUCCESS",
        //     "error": "",
        //     "errors": {}
        //   }
        //
        if (response['status'] !== 'SUCCESS') {
            throw new BadRequest (this.id + ' Exchange responded with: ' + response['error']);
        } else {
            const market = this.market (symbol);
            const requestTrade = { 'id': response['id'] };
            const trade = await this.privateGetAuthOrderGetOrderId (this.extend (requestTrade, params));
            const amount = this.safeFloat (trade, 'quantity');
            const filled = this.safeFloat (trade, 'filled');
            const remaining = amount - filled;
            return {
                'id': id,
                'timestamp': this.safeString (trade, 'timestamp'),
                'datetime': this.iso8601 (this.safeString (trade, 'timestamp')),
                'lastTradeTimestamp': undefined,
                'status': this.parseOrderStatus (this.safeString (trade, 'orderStatus')),
                'symbol': market['symbol'],
                'type': this.safeString (trade, 'type'),
                'side': this.safeString (trade, 'side'),
                'price': this.safeFloat (trade, 'price'),
                'cost': undefined,
                'amount': amount,
                'filled': filled,
                'average': undefined,
                'remaining': remaining,
                'fee': undefined,
                'trades': undefined,
            };
        }
    }

    sign (path, api = 'public', method = 'GET', params = undefined, headers = undefined, body = undefined) {
        let request = '/' + this.version + '/' + this.implodeParams (path, params);
        const query = this.omit (params, this.extractParams (path));
        const requestHash = '/' + this.version + '/' + this.implodeParams (path, params);
        const urlencodedQuery = this.urlencode (query);
        if (method === 'GET' && Object.keys (query).length) {
            request += '?' + urlencodedQuery;
        }
        if (api === 'private') {
            this.checkRequiredCredentials ();
            const signature = this.hmac (this.encode (method + requestHash + urlencodedQuery), this.encode (this.secret), 'sha256', 'hex');
            headers = {
                'X-LA-APIKEY': this.apiKey,
                'X-LA-SIGNATURE': signature,
            };
            if (method === 'POST') {
                headers['Content-Type'] = 'application/json';
                body = this.json (query);
            }
        }
        const url = this.urls['api'] + request;
        return { 'url': url, 'method': method, 'body': body, 'headers': headers };
    }

    handleErrors (code, reason, url, method, headers, body, response, requestHeaders, requestBody) {
        if (!response) {
            return;
        }
        //
        //     { "message": "Request limit reached!", "details": "Request limit reached. Maximum allowed: 1 per 1s. Please try again in 1 second(s)." }
        //     { "error": { "message": "Pair 370 is not found","errorType":"RequestError","statusCode":400 }}
        //     { "error": { "message": "Signature or ApiKey is not valid","errorType":"RequestError","statusCode":400 }}
        //     { "error": { "message": "Request is out of time", "errorType": "RequestError", "statusCode":400 }}
        //     { "error": { "message": "Price needs to be greater than 0","errorType":"ValidationError","statusCode":400 }}
        //     { "error": { "message": "Side is not valid, Price needs to be greater than 0, Amount needs to be greater than 0, The Symbol field is required., OrderType is not valid","errorType":"ValidationError","statusCode":400 }}
        //     { "error": { "message": "Cancelable order whit ID 1563460289.571254.704945@0370:1 not found","errorType":"RequestError","statusCode":400 }}
        //     { "error": { "message": "Symbol must be specified","errorType":"RequestError","statusCode":400 }}
        //     { "error": { "message": "Order 1563460289.571254.704945@0370:1 is not found","errorType":"RequestError","statusCode":400 }}
        //
        const message = this.safeString (response, 'message');
        const feedback = this.id + ' ' + body;
        if (message !== undefined) {
            this.throwExactlyMatchedException (this.exceptions['exact'], message, feedback);
            this.throwBroadlyMatchedException (this.exceptions['broad'], message, feedback);
        }
        const error = this.safeValue (response, 'error', {});
        const errorMessage = this.safeString (error, 'message');
        if (errorMessage !== undefined) {
            this.throwExactlyMatchedException (this.exceptions['exact'], errorMessage, feedback);
            this.throwBroadlyMatchedException (this.exceptions['broad'], errorMessage, feedback);
            throw new ExchangeError (feedback); // unknown message
        }
    }
};
