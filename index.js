// Import the necessary libraries
const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');

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

  const fetchTransactions = async () => {
    try {
      const response = await axios.get(url);
      const transactions = response.data;

      if (!transactions || transactions.length === 0) {
        return bot.sendMessage(chatId, `ℹ️ No recent transactions found for ${address}.`);
      }

      // Fetch the latest transaction
      const latestTx = transactions[0];
      const time = new Date(latestTx.blockTime * 1000).toLocaleString();

      // Check for DeFi activity
      const isDeFi = latestTx.instructions.some((instr) =>
        instr?.parsed?.type === 'swap' || instr?.parsed?.info?.program === 'DeFi'
      );

      let tokenName = 'N/A';
      let tokenAddress = 'N/A';
      if (isDeFi) {
        const tokenInfo = latestTx.instructions.find((instr) =>
          instr?.parsed?.info?.tokenName
        )?.parsed?.info;

        tokenName = tokenInfo?.tokenName || 'Unknown Token';
        tokenAddress = tokenInfo?.mint || 'Unknown Address';
      }

      // Create ASCII Art with token details for DeFi or regular
      const asciiArt = `
\`\`\`
+------------------------------------------+
|               🟢 Latest TX               |
+------------------------------------------+
|  🕒 Time: ${time}                    |
|------------------------------------------|
|  ${isDeFi ? `🚨 DeFi Activity Detected!` : `Regular Transaction`}     |
${isDeFi ? `|  💠 Token: ${tokenName}                         |` : ''}
${isDeFi ? `|  📄 Contract: ${tokenAddress}       |` : ''}
+------------------------------------------+
\`\`\`
      `;

      // Create view link
      const txLink = `https://solscan.io/tx/${latestTx.signature}`;

      const options = {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔍 View on Solscan', url: txLink }],
          ],
        },
      };

      // Send the formatted message
      bot.sendMessage(chatId, asciiArt, options);
    } catch (error) {
      console.error('Error fetching transactions:', error.message);
      bot.sendMessage(chatId, '❌ Failed to fetch transaction details.');
    }
  };

  // Fetch transactions every 30 seconds
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