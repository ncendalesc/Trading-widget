import { useState, useEffect, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import './App.css';

function App() {
    const [trades, setTrades] = useState(() => {
        const savedTrades = localStorage.getItem('mis_notas_trading');
        return savedTrades ? JSON.parse(savedTrades) : [];
    });

    const [coin, setCoin] = useState('');
    const [entryPrice, setEntryPrice] = useState('');
    const [investedUsdt, setInvestedUsdt] = useState('');
    const [sellTarget, setSellTarget] = useState('');

    const [livePrices, setLivePrices] = useState({});

    const binanceCoins = useRef({});

    useEffect(() => {
        localStorage.setItem('mis_notas_trading', JSON.stringify(trades));
    }, [trades]);

    // 🚀 MOTOR 1: BINANCE
    useEffect(() => {
        const fetchBinance = async () => {
            if (trades.length === 0) return;
            try {
                const res = await fetch('https://api.binance.com/api/v3/ticker/price');
                const data = await res.json();

                const newBinancePrices = {};
                data.forEach(item => {
                    if (item.symbol.endsWith('USDT')) {
                        newBinancePrices[item.symbol.replace('USDT', '')] = parseFloat(item.price);
                    }
                });

                binanceCoins.current = newBinancePrices;

                setLivePrices(prevPrices => {
                    const updated = { ...prevPrices };
                    trades.forEach(t => {
                        if (newBinancePrices[t.coin]) {
                            updated[t.coin] = newBinancePrices[t.coin];
                        }
                    });
                    return updated;
                });
            } catch (error) {
                console.error("Error en Binance:", error);
            }
        };

        fetchBinance();
        const interval = setInterval(fetchBinance, 5000);
        return () => clearInterval(interval);
    }, [trades]);

    // 🚜 MOTOR 2: DEXSCREENER
    useEffect(() => {
        const fetchDex = async () => {
            if (trades.length === 0) return;

            const missingCoins = trades.map(t => t.coin).filter(c => !binanceCoins.current[c]);
            if (missingCoins.length === 0) return;

            const newDexPrices = {};
            for (const missingCoin of missingCoins) {
                try {
                    const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${missingCoin}`);
                    const data = await res.json();

                    if (data.pairs && data.pairs.length > 0) {
                        newDexPrices[missingCoin] = parseFloat(data.pairs[0].priceUsd);
                    }
                    await new Promise(r => setTimeout(r, 200));
                } catch (error) {
                    console.error(`Error en DexScreener para ${missingCoin}:`, error);
                }
            }
            setLivePrices(prevPrices => ({ ...prevPrices, ...newDexPrices }));
        };

        const initialDelay = setTimeout(fetchDex, 1500);
        const interval = setInterval(fetchDex, 30000);

        return () => {
            clearTimeout(initialDelay);
            clearInterval(interval);
        };
    }, [trades]);

    const addTrade = () => {
        if (!coin || !entryPrice || !investedUsdt) return;

        const newTrade = {
            id: Date.now(),
            coin: coin.trim(),
            entry: parseFloat(entryPrice),
            invested: parseFloat(investedUsdt),
            target: sellTarget ? parseFloat(sellTarget) : null
        };

        setTrades([...trades, newTrade]);

        setCoin('');
        setEntryPrice('');
        setInvestedUsdt('');
        setSellTarget('');
    };

    const deleteTrade = (id) => {
        setTrades(trades.filter(trade => trade.id !== id));
    };

    const formatCoinName = (name) => {
        if (name.length > 10) {
            return name.substring(0, 4) + '...' + name.substring(name.length - 4);
        }
        return name.toUpperCase();
    };

    return (
        <div className="glass-panel">
            {/* NUEVA ESTRUCTURA DEL HEADER */}
            <div className="top-bar">
                <div className="header-drag-zone" data-tauri-drag-region>
                    <h2>Registro Trading (USDT)</h2>
                </div>
                {/* Botón separado físicamente y usando comando nativo */}
                <div className="close-window-btn" onClick={() => getCurrentWindow().close()}>✕</div>
            </div>

            <div className="add-trade-bar">
                <input className="nodrag coin-input" value={coin} onChange={e => setCoin(e.target.value)} placeholder="Ticker" />
                <input type="number" className="nodrag" value={entryPrice} onChange={e => setEntryPrice(e.target.value)} placeholder="Compra" />
                <input type="number" className="nodrag" value={investedUsdt} onChange={e => setInvestedUsdt(e.target.value)} placeholder="Inversión" />
                <input type="number" className="nodrag optional-input" value={sellTarget} onChange={e => setSellTarget(e.target.value)} placeholder="venta" />
                <button className="nodrag add-btn" onClick={addTrade}>+ Añadir</button>
            </div>

            <div className="table-container nodrag">
                <table className="trading-table">
                    <thead>
                        <tr>
                            <th>Moneda</th>
                            <th>Compra</th>
                            <th>Orden Venta</th>
                            <th>Actual</th>
                            <th>Inversión</th>
                            <th>P/L (USDT)</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {trades.length === 0 ? (
                            <tr><td colSpan="7" className="empty-msg">Añade una moneda (BTC, ETH o Contrato Alpha).</td></tr>
                        ) : (
                            trades.map(trade => {
                                const currentPrice = livePrices[trade.coin] || 0;
                                const coinsBought = trade.invested / trade.entry;
                                const currentValue = coinsBought * currentPrice;
                                const profitLoss = currentPrice > 0 ? (currentValue - trade.invested) : 0;
                                const isProfit = profitLoss >= 0;

                                return (
                                    <tr key={trade.id}>
                                        <td className="coin-cell" title={trade.coin}>{formatCoinName(trade.coin)}</td>
                                        <td>${trade.entry.toLocaleString()}</td>
                                        <td className="target-cell">{trade.target ? `$${trade.target.toLocaleString()}` : '-'}</td>
                                        <td className="live-cell">
                                            {currentPrice > 0 ? `$${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}` : 'Cargando...'}
                                        </td>
                                        <td>${trade.invested.toLocaleString()}</td>
                                        <td className={isProfit ? 'green' : 'red'}>
                                            {currentPrice > 0 ? (isProfit ? '+' : '') + '$' + profitLoss.toFixed(2) : '-'}
                                        </td>
                                        <td><button className="delete-btn" onClick={() => deleteTrade(trade.id)}>✕</button></td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
export default App;