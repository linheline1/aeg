"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatBRL = formatBRL;
exports.formatCurrency = formatCurrency;
exports.formatRmb = formatRmb;
exports.round2 = round2;
exports.round4 = round4;
function formatBRL(value, style = 'en-US') {
    const opts = {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    };
    const locale = style === 'pt-BR' ? 'pt-BR' : 'en-US';
    const symbol = style === 'pt-BR' ? 'R$' : 'BRL';
    return `${symbol} ${value.toLocaleString(locale, opts)}`;
}
function formatCurrency(value, currency) {
    try {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency,
            minimumFractionDigits: 2
        }).format(value);
    }
    catch {
        return `${currency} ${value.toFixed(2)}`;
    }
}
function formatRmb(value) {
    return `¥ ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function round2(value) {
    return Math.round(value * 100) / 100;
}
function round4(value) {
    return Math.round(value * 10000) / 10000;
}
//# sourceMappingURL=currencies.js.map