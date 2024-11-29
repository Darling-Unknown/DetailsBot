
// Import the necessary libraries
const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const fs = require('fs');
const path = require('path');


// Initialize express app
const app = express();
app.use(bodyParser.json());

// Initialize a cookie jar
const cookieJar = new CookieJar();
const client = wrapper(axios.create({ jar: cookieJar }));

// Replace with your bot token
const botToken = '7673269679:AAF99Sf_fEkkhlJEaj-wAQJAyqT5LtJ764s';
const bot = new TelegramBot(botToken);
const webhookurl = `https://tokeninformation-yrv96gzw.b4a.run//bot${botToken}`;
bot.setWebHook(webhookurl);

let trackedAddresses = [];
let tokenMessageId = null;
let updateInterval;

// Function to fetch token details from Dexscreener
async function getTokenDetails(tokenAddress) {
  try {
    const response = await client.get(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
      {
        headers: {
          'User-Agent': 'DarlingtonBot/1.0',
          'Accept': 'application/json',
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error fetching token details:', error.response?.data || error.message);
    throw new Error('Failed to fetch token details from Dexscreener.');
  }
}

// Function to format token details into a large ASCII card
function createAsciiCard(tokenData) {
  const primaryPair = tokenData.pairs[0];
  let card = '+------------------------------------------+\n';
  card += '|             Darlington🤖               |\n';
  card += '|------------------------------------------|\n';
  card += `|  Token Name: ${primaryPair.baseToken.name || 'TOKEN NAME'}               |\n`;
  card += `|  ROI (24h): ${primaryPair.priceChange.h24 + '%' || '+0.00%'}                 |\n`;
  card += `|  Price: $${primaryPair.priceUsd || 'N/A'}                               |\n`;
  card += `|  Market Cap: $${primaryPair.fdv || 'N/A'}                              |\n`;
  card += '|------------------------------------------|\n';
  card += '|               Support: Palmpay 😏         |\n';
  card += '|               Contact: 9035751502 👀      |\n';
  card += '+------------------------------------------+\n';

  if (primaryPair.txns?.h24?.buys && primaryPair.txns?.h24?.sells) {
    card += `\n    🔔 Latest Transactions:\n`;
    card += `    💚 Buys: ${primaryPair.txns.h24.buys}\n`;
    card += `    ❤️ Sells: ${primaryPair.txns.h24.sells}\n`;
  } else {
    card += '\n    🔔 No recent transactions found.\n';
  }

  return card;
}

// Command to fetch token details and display them
bot.onText(/\/addtoken (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const tokenAddress = match[1].trim();

  if (updateInterval) clearInterval(updateInterval);

  const updateMessage = async () => {
    try {
      if (tokenMessageId) {
        await bot.deleteMessage(chatId, tokenMessageId).catch(() => {});
      }

      const tokenData = await getTokenDetails(tokenAddress);

      if (!tokenData || !tokenData.pairs || tokenData.pairs.length === 0) {
        throw new Error('No data found for the provided token.');
      }

      const asciiCard = createAsciiCard(tokenData);

      const options = {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🛒 Buy Directly💸',
                url: `https://t.me/odysseus_trojanbot?start=r-scch-${tokenAddress}`,
              },
            ],
          ],
        },
      };

      const sentMessage = await bot.sendMessage(chatId, `<pre>${asciiCard}</pre>`, options);
      tokenMessageId = sentMessage.message_id;
    } catch (error) {
      console.error('Error updating token details:', error.message);
      bot.sendMessage(chatId, '❌ Failed to update token information.');
    }
  };

  updateInterval = setInterval(updateMessage, 20000);
  updateMessage();
});

bot.onText(/\/track (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const address = match[1].trim();

  if (!/^.{32,44}$/.test(address)) {
    return bot.sendMessage(chatId, '❌ Invalid Solana address.');
  }

  const apiKey = '90e6da69-c93b-4b35-864b-a422ffb40540';
  const url = `https://api.helius.xyz/v0/addresses/${address}/transactions/?api-key=${apiKey}`;
  let lastTransactionSignature = null;

  const fetchTransactions = async () => {
    try {
      const response = await axios.get(url);
      const transactions = response.data;

      if (!transactions || transactions.length === 0) {
        return bot.sendMessage(chatId, `ℹ️ No recent transactions found for ${address}.`);
      }

      const latestTx = transactions[0];
      const latestSignature = latestTx.signature;

      if (lastTransactionSignature === latestSignature) return;

      lastTransactionSignature = latestSignature;

      // Check if the transaction involves any known DeFi swap programs
      const isDeFi = latestTx.instructions.some((instr) =>
        instr?.parsed?.type === 'swap' || 
        ['serum', 'raydium', 'orca', 'saber', 'marinade'].includes(instr?.parsed?.info?.program)
      );

      let transactionType = 'Transfer';
      if (isDeFi) {
        transactionType = 'DeFi Activity (Swap)';
      } else if (latestTx.instructions.some((instr) => instr?.parsed?.type === 'stake')) {
        transactionType = 'Staking';
      }

      const asciiArt = `
\`\`\`
+--------------------------------------+
|         🟢 New Transaction           |
+--------------------------------------+
|  🔑 TX Hash: ${latestSignature.slice(0, 20)}.|
|--------------------------------------|
|  💡 Type: ${transactionType}         |
|--------------------------------------|
|  🌐 Address: ${address.slice(0, 16)}.........|
+--------------------------------------+
\`\`\`
      `;

      const txLink = `https://solscan.io/tx/${latestSignature}`;
      const options = {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔍 View on Solscan', url: txLink }],
          ],
        },
      };

      const imagePath = path.resolve(__dirname, '1726064711020_1.jpg');
      if (fs.existsSync(imagePath)) {
        await bot.sendPhoto(chatId, imagePath, {
          caption: asciiArt,
          parse_mode: 'Markdown',
          reply_markup: options.reply_markup,
        });
      } else {
        console.error('Image not found. Ensure gr.jpg exists in the script directory.');
        bot.sendMessage(chatId, asciiArt, options);
      }
    } catch (error) {
      console.error('Error fetching transactions:', error.message);
      bot.sendMessage(chatId, '❌ Failed to fetch transaction details.');
    }
  };

  setInterval(fetchTransactions, 30000);
  fetchTransactions();
});
// Webhook endpoint
app.post(`/bot${botToken}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Start the server
const port = process.env.port || 3000;
app.listen(port, () => {
  console.log(`Bot is running on port ${port}`);
});