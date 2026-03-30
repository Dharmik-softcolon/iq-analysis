export type MarketState = "DISCOVERY" | "TRANSITION" | "BALANCE" | "UNKNOWN";
export type Direction = "BULL" | "BEAR" | "NO_TRADE";
export type SystemMode = "NORMAL" | "EVENT" | "STANDBY" | "SHUTDOWN";
export type TradeStatus = "ACTIVE" | "PARTIAL" | "CLOSED" | "SL_HIT";

export interface IAEBreakdown {
    isIb: number;
    pureOI: number;
    oiDelta: number;
    volX: number;
    gamma: number;
    mp: number;
    tre: number;
}

export interface BuildupTick {
    time: string;
    lb: number;
    sb: number;
    sc: number;
    lu: number;
    totalBullish: number;
    totalBearish: number;
    ivp: number;
}

export interface SystemState {
    timestamp: string;
    systemMode: SystemMode;
    marketState: MarketState;
    iaeScore: number;
    iaeBreakdown: IAEBreakdown;
    direction: Direction;
    activePositions: number;
    tradesToday: number;
    dailyPnL: number;
    capital: number;
    niftyLTP: number;
    pcr: number;
    dte: number;
    // Buildup fields from NativeEngine
    dominantBuildup?: string;
    iv?: number;
    ivp?: number;
    lbOIChg?: number;
    sbOIChg?: number;
    scOIChg?: number;
    luOIChg?: number;
    totalBullishOI?: number;
    totalBearishOI?: number;
    buildupHistory?: BuildupTick[];
}

export interface Trade {
    _id: string;
    signalId: string;
    direction: "BULL" | "BEAR";
    optionType: "CE" | "PE";
    strike: number;
    expiry: string;
    iaeScore: number;
    marketState: MarketState;
    entryPremium: number;
    entryTime: string;
    totalLots: number;
    t1Lots: number;
    t2Lots: number;
    t3Lots: number;
    t1Target: number;
    t2Target: number;
    slPremium: number;
    t1Exited: boolean;
    t2Exited: boolean;
    t3Exited: boolean;
    t1PnL?: number;
    t2PnL?: number;
    t3PnL?: number;
    totalPnL: number;
    status: TradeStatus;
    exitReason?: string;
    capitalDeployed: number;
    riskAmount: number;
    adverseIndexSL?: number;
    createdAt: string;
}

export interface TradeStats {
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: string;
    totalPnL: string;
    avgWin: string;
    avgLoss: string;
    rrRatio: string;
    iaeBreakdown: Record<string, {
        trades: number;
        wins: number;
        winRate: string;
        avgPnL: string;
    }>;
}