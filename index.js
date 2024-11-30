
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
// Import necessary libraries (existing imports assumed)

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    "Hi! Set up your group's assets dashboard by clicking the button below.",
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Continue", callback_data: "setup_dashboard" }],
        ],
      },
    }
  );
});

// Step 1: Setup Group Members
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data === "setup_dashboard") {
    bot.sendMessage(
      chatId,
      "How many users are involved? Select below (1-10).",
      {
        reply_markup: {
          inline_keyboard: Array.from({ length: 10 }, (_, i) => [
            { text: `${i + 1}`, callback_data: `set_users_${i + 1}` },
          ]),
        },
      }
    );
  }

  if (data.startsWith("set_users_")) {
    const memberCount = parseInt(data.split("_")[2]);
    bot.sendMessage(
      chatId,
      `You selected ${memberCount} members. Please enter their Telegram IDs separated by commas (e.g., 123456, 234567).`
    );

    bot.once("message", async (response) => {
      const userIds = response.text.split(",").map((id) => id.trim());
      bot.sendMessage(
        chatId,
        `Members set! Now, connect the group's wallet by using the command:\n\n<code>/g [wallet_address]</code>`,
        { parse_mode: "HTML" }
      );

      // Save user IDs for further steps
      bot.userData = bot.userData || {};
      bot.userData[chatId] = { userIds, memberCount };
    });
  }
});

// Step 2: Connect Wallet and Fetch Balance
bot.onText(/\/g (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const walletAddress = match[1].trim();

  if (!walletAddress) {
    return bot.sendMessage(chatId, "❌ Please provide a valid wallet address.");
  }

  // Save wallet address for the group
  bot.userData = bot.userData || {};
  bot.userData[chatId] = {
    ...bot.userData[chatId],
    walletAddress,
  };

  bot.sendMessage(chatId, "Processing wallet information...");

  try {
    // Fetch token details using the Dexscreener API
    const tokenData = await getTokenDetails(walletAddress);

    if (!tokenData || !tokenData.pairs || tokenData.pairs.length === 0) {
      throw new Error("No data found for the provided wallet.");
    }

    // Extract balance and calculate individual shares
    const primaryPair = tokenData.pairs[0];
    const totalBalance = parseFloat(primaryPair.priceUsd || "0").toFixed(2);
    const { userIds, memberCount } = bot.userData[chatId];
    const individualBalance = (totalBalance / memberCount).toFixed(2);

    // Construct dashboard
    let dashboard = `\n\n<b>🌟 5T DEGEN Wallet 🌟</b>\n`;
    dashboard += `<b>Total Balance:</b> $${totalBalance}\n\n`;

    dashboard += `<b>💸 Member Balances:</b>\n`;
    userIds.forEach((userId, index) => {
      dashboard += `<b>${userId}:</b> $${individualBalance}\n`;
    });

    dashboard += `\n<b>🔍 Tokens in Possession:</b>\n`;
    primaryPair.tokens.forEach((token, i) => {
      dashboard += `${i + 1}. ${token}\n`;
    });

    bot.sendMessage(chatId, dashboard, { parse_mode: "HTML" });
  } catch (error) {
    console.error("Error processing wallet data:", error.message);
    bot.sendMessage(chatId, "❌ Failed to fetch wallet information.");
  }
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
  let lastMessageId = null;

  // Function to fetch and process transactions
  const fetchTransactions = async () => {
    try {
      const response = await axios.get(url);
      const transactions = response.data;

      if (!transactions || transactions.length === 0) {
        console.log(`No recent transactions for address: ${address}`);
        return;
      }

      const latestTx = transactions[0];
      const latestSignature = latestTx.signature;

      // Skip if the latest transaction hasn't changed
      if (lastTransactionSignature === latestSignature) return;

      lastTransactionSignature = latestSignature;

      const isDeFi = latestTx.instructions.some((instr) =>
        instr?.parsed?.type === 'swap' || instr?.parsed?.info?.program === 'DeFi'
      );

      let transactionType = 'Transfer';
      if (isDeFi) {
        transactionType = 'DeFi Activity';
      } else if (latestTx.instructions.some((instr) => instr?.parsed?.type === 'stake')) {
        transactionType = 'Staking';
      }

      const asciiArt = `
\`\`\`
+--------------------------------------+
|         🟢 New Transaction           |
+--------------------------------------+
|  🔑 TX Hash: ${latestSignature.slice(0, 20)}... |
|--------------------------------------|
|  💡 Type: ${transactionType}         |
|--------------------------------------|
|  🌐 Address: ${address.slice(0, 16)}... |
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

      // Delete the last message if it exists
      if (lastMessageId) {
        await bot.deleteMessage(chatId, lastMessageId).catch((err) =>
          console.error('Error deleting previous message:', err.message)
        );
      }

      // Send a new message
      const sentMessage = await bot.sendMessage(chatId, asciiArt, options);
      lastMessageId = sentMessage.message_id;
    } catch (error) {
      console.error('Error fetching transactions:', error.message);
      bot.sendMessage(chatId, '❌ Failed to fetch transaction details.');
    }
  };

  // Clear any existing interval for this chat and address
  if (trackedAddresses[chatId]) {
    clearInterval(trackedAddresses[chatId]);
  }

  // Start a new interval for this address
  trackedAddresses[chatId] = setInterval(fetchTransactions, 30000);
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