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
          'User-Agent': 'DarlingtonBot/1.0', // A custom User-Agent to identify your bot
          'Accept': 'application/json', // Ensure the API knows you want JSON data
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
  const primaryPair = tokenData.pairs[0]; // Assuming the first pair is the most relevant

  // Prepare a large ASCII art card with token details
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

  // Add latest transactions if available
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

  // Clear previous interval to avoid duplication
  if (updateInterval) clearInterval(updateInterval);

  const updateMessage = async () => {
    try {
      // Delete the previous message if it exists
      if (tokenMessageId) {
        await bot.deleteMessage(chatId, tokenMessageId).catch(() => {});
      }

      // Fetch token details
      const tokenData = await getTokenDetails(tokenAddress);

      if (!tokenData || !tokenData.pairs || tokenData.pairs.length === 0) {
        throw new Error('No data found for the provided token.');
      }

      // Generate the ASCII card
      const asciiCard = createAsciiCard(tokenData);

      // Send the ASCII card message
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

  // Update the message every 20 seconds
  updateInterval = setInterval(updateMessage, 20000);
  updateMessage(); // Call immediately
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