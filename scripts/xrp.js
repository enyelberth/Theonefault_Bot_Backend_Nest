const fs = require('fs');

/**
 * Configuración de la estrategia
 */
const settings = {
    id: "er10",
    symbol: "XRPFDUSD",
    startPrice: 1.90,    // Precio desde donde empiezan las órdenes
    step: 0.0009,          // Cuánto baja el precio en cada nivel (ej. 0.01)
    totalLevels: 30,     // Cuántas órdenes quieres crear
    quantityPerOrder: 3, // Cantidad fija por orden
    profitMargin: 0.0018
};

const generateAutoStrategy = () => {
    const orders = [];

    for (let i = 1; i <= settings.totalLevels; i++) {
        // Calcula el precio restando el step por cada nivel
        // Usa toFixed(4) para evitar problemas de decimales en JS
        const calculatedPrice = parseFloat((settings.startPrice - (i - 1) * settings.step).toFixed(4));

        orders.push({
            id: i,
            price: calculatedPrice,
            quantity: settings.quantityPerOrder
        });
    }

    const strategy = {
        id: settings.id,
        typeId: 1,
        symbol: settings.symbol,
        strategyType: "gridBuyMarginFixed",
        config: {
            profitMargin: settings.profitMargin,
            ordersLevels: orders
        }
    };

    // Guardar en archivo
    fs.writeFileSync('strategy.json', JSON.stringify(strategy, null, 2));
    console.log(`✅ Se han generado ${settings.totalLevels} niveles automáticamente.`);
    console.table(orders); // Muestra una tabla en consola para verificar
};

generateAutoStrategy();