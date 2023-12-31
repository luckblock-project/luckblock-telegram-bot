import dotenv from 'dotenv';
dotenv.config();

import fetch from 'node-fetch';
import TelegramBot from 'node-telegram-bot-api';

import { EventEmitter } from 'node:events';
import { fetchAuditData, fetchTokenStatistics, formatTokenStatistics, triggerAudit, waitForAuditEndOrError, WAITING_GENERATION_AUDIT_MESSAGE } from '@luckblock/goplus-ai-analyzer-js';

const token = process.env.BOT_TOKEN;

const bot = new TelegramBot(token, {
    polling: true
});

bot.onText(/\/start/, (msg) => {

    const chatId = msg.chat.id;
    bot.sendMessage(chatId, '🤖 Welcome to the LuckBlock Telegram bot! 🤖\n\n/audit - Full analysis of any erc20 smart contract.\n\n/performance - Track the PnL of any wallet (limited to uniswap v2 during BETA mode)\n\n/block0 - First one in, first one out. The fastest DeFi trading bot, guaranteed.\n\n/register - Register your wallet for air drops, early sniper access and more.');

});

// on /performance or /block0, send coming soon

bot.onText(/\/performance/, (msg) => {

    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Coming soon... 🔒');

});

bot.onText(/\/block0/, (msg) => {

    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Coming soon... 🔒');

});

bot.onText(/\/register/, (msg) => {

    const chatId = msg.chat.id;
    const [command, ...args] = msg.text.split(' ');

    if (!args[0]) {
        return bot.sendMessage(chatId, 'Please provide a valid address (e.g. /register 0x1234...)');
    }

    fetch('https://api.luckblock.io/register/' + args[0], {
        method: 'POST'
    });

    bot.sendMessage(chatId, 'Registered Successfully! ✅');
});

bot.onText(/\/audit/, async (msg, match) => {

    const chatId = msg.chat.id;
    const [command, ...args] = match.input.split(' ');
    
    const contractAddress = args[0];

    if (!contractAddress) {
        return bot.sendMessage(chatId, 'Please provide a contract address');
    }

    const message = await bot.sendMessage(chatId, 'Loading insights...');

    const [statistics, initialAuditData] = await Promise.all([
        fetchTokenStatistics(contractAddress),
        fetchAuditData(contractAddress)
    ]);

    if (!statistics) {
        return bot.editMessageText('❌ Oops, something went wrong!', {
            message_id: message.message_id,
            chat_id: chatId
        });
    }

    const initialAuditIsReady = initialAuditData && initialAuditData.status === 'success';
    const statisticsMessage = formatTokenStatistics(statistics, true, initialAuditIsReady ? JSON.parse(initialAuditData?.data) : null);

    await bot.editMessageText(statisticsMessage, {
        parse_mode: 'MarkdownV2',
        message_id: message.message_id,
        chat_id: chatId,
        disable_web_page_preview: true
    });

    if (!initialAuditIsReady) {

        triggerAudit(contractAddress);

        const ee = new EventEmitter();
        // subscribe to audit changes
        waitForAuditEndOrError(contractAddress, ee);

        const auditGenerationMessage = await bot.sendMessage(chatId, `🔍 (audit generation AI) : starting...`);

        ee.on('status-update', (status) => {
            bot.editMessageText(`🔍 (audit generation AI): ${status}`, {
                message_id: auditGenerationMessage.message_id,
                chat_id: chatId,
                disable_web_page_preview: true
            });
        });

        ee.on('end', (audit) => {
            const auditStatisticsMessage = formatTokenStatistics(statistics, true, audit);
            bot.deleteMessage(auditGenerationMessage.chat.id, auditGenerationMessage.message_id);

            bot.editMessageText(auditStatisticsMessage, {
                parse_mode: 'MarkdownV2',
                message_id: message.message_id,
                chat_id: chatId,
                disable_web_page_preview: true
            });
        });

        ee.on('error', (error) => {
            const newStatisticsWithoutAudit = statisticsMessage.replace(WAITING_GENERATION_AUDIT_MESSAGE, `[Use our web app](https://app.luckblock.io/audit) to generate the audit report.`);
            bot.editMessageText(`❌ Oops, something went wrong! (${error})`, {
                message_id: auditGenerationMessage.message_id,
                chat_id: chatId,
                disable_web_page_preview: true
            });
            bot.editMessageText(newStatisticsWithoutAudit, {
                parse_mode: 'MarkdownV2',
                message_id: message.message_id,
                chat_id: chatId,
                disable_web_page_preview: true
            });
        });

    }
   
});

console.log(`🤖 luckblock bot is started!`);

function cleanUpServer() {
    console.log(`🤖 luckblock bot is stopped!`);
    bot.stopPolling({ cancel: true });
    process.exit();
}

process.on('uncaughtException', (err) => {
    console.error(err);
    cleanUpServer();
});

[`exit`, `SIGINT`, `SIGUSR1`, `SIGUSR2`, `SIGTERM`].forEach((eventType) => {
    process.on(eventType, cleanUpServer.bind(null, eventType));
});
