

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
function createTokenCard(tokenData) {
  const primaryPair = tokenData.pairs[0];
  const name = primaryPair.baseToken.name || 'TOKEN NAME';
  const roi = primaryPair.priceChange?.h24 ? `${primaryPair.priceChange.h24}%` : '+0.00%';
  const price = primaryPair.priceUsd ? `$${primaryPair.priceUsd}` : 'N/A';
  const marketCap = primaryPair.fdv ? `$${primaryPair.fdv}` : 'N/A';
  const buys = primaryPair.txns?.h24?.buys || 'N/A';
  const sells = primaryPair.txns?.h24?.sells || 'N/A';

  // Define card templates
  const templates = [
    // Design 1: Modern Dashboard Style
    `
==================== DASHBOARD ====================
🔹 Token Name       : ${name}
🔹 ROI (24h)        : ${roi}
🔹 Current Price    : ${price}
🔹 Total Market Cap : ${marketCap}
---------------------------------------------------
🛒 24h Transactions:
   ✅ Buys          : ${buys}
   ❌ Sells         : ${sells}
===================================================
`,

    // Design 2: Summary List
    `
*** Darlington Token Summary ***
--------------------------------
Token Details:
  - Name          : ${name}
  - ROI (24h)     : ${roi}
  - Price         : ${price}
  - Market Cap    : ${marketCap}

Activity:
  - Transactions:
    💚 Buys  : ${buys}
    ❤️ Sells : ${sells}
--------------------------------
`,

    // Design 3: Detailed Report
    `
::::::::::::::::::::::::::::::::::::::::::::::
::        Darlington Token Report 🤖         ::
::::::::::::::::::::::::::::::::::::::::::::::
:: Token Name    : ${name}
:: ROI (24h)     : ${roi}
:: Price (USD)   : ${price}
:: Market Cap    : ${marketCap}
::::::::::::::::::::::::::::::::::::::::::::::
:: Transactions (Last 24h):
   💚 Buys   -> ${buys}
   ❤️ Sells  -> ${sells}
::::::::::::::::::::::::::::::::::::::::::::::
`,

    // Design 4: Sleek Header/Footer
    `
+---------------------------------------+
|         Darlington Token Info         |
+---------------------------------------+
|  Name          : ${name}
|  ROI (24h)     : ${roi}
|  Price         : ${price}
|  Market Cap    : ${marketCap}
+---------------------------------------+
|  Transactions:                        |
|   💚 Buys  : ${buys}
|   ❤️ Sells : ${sells}
+---------------------------------------+
`,

    // Design 5: Business Report
    `
-----------------------------------------
  📊 Darlington Token Market Overview 🤖
-----------------------------------------
  • Name          : ${name}
  • ROI (24h)     : ${roi}
  • Price (USD)   : ${price}
  • Market Cap    : ${marketCap}
-----------------------------------------
  🔔 Transaction Summary:
     - 💚 Buys  : ${buys}
     - ❤️ Sells : ${sells}
-----------------------------------------
`
  ];

  // Pick a random template
  const randomTemplate = templates[Math.floor(Math.random() * templates.length)];
  return randomTemplate;
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

      // Use the new createTokenCard function
      const tokenCard = createTokenCard(tokenData);

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

      // Send the token card
      const sentMessage = await bot.sendMessage(chatId, `<pre>${tokenCard}</pre>`, options);
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

// Function to fetch Solana balance from the JSON-RPC
async function getSolBalance(address) {
  const solanaUrl = 'https://api.mainnet-beta.solana.com';
  const data = {
    jsonrpc: '2.0',
    id: 1,
    method: 'getBalance',
    params: [address],
  };

  try {
    const response = await axios.post(solanaUrl, data);
    return response.data.result.value / 1e9; // Convert lamports to SOL
  } catch (error) {
    console.error('Error fetching Sol balance:', error.message);
    return 0;
  }
}

// Function to fetch the current SOL to USDT price from CoinGecko
async function getSolToUsdtPrice() {
  const url = 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd'; // CoinGecko endpoint for SOL to USD

  try {
    const response = await axios.get(url);
    return response.data.solana.usd; // Get SOL price in USD (USDT is pegged 1:1 with USD)
  } catch (error) {
    console.error('Error fetching SOL to USDT price:', error.message);
    return 0; // Return 0 if there's an error
  }
}
// Function to fetch token balances and contract addresses from a Solana wallet
async function getSolanaTokenBalances(address) {
  const solanaUrl = 'https://api.mainnet-beta.solana.com';
  const data = {
    jsonrpc: '2.0',
    id: 1,
    method: 'getTokenAccountsByOwner',
    params: [
      address,
      { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
      { encoding: 'jsonParsed' }
    ],
  };

  try {
    const response = await axios.post(solanaUrl, data);
    const accounts = response.data.result.value;
    return accounts.map(account => ({
      tokenAmount: account.account.data.parsed.info.tokenAmount.uiAmount,
      tokenAddress: account.account.data.parsed.info.mint,
    }));
  } catch (error) {
    console.error('Error fetching token balances:', error.message);
    return [];
  }
}
async function getTokenInfoFromDexscreener(contractAddress) {
  const url = `https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`;

  try {
    // Fetch the token details
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'DarlingtonBot/1.0',
        'Accept': 'application/json',
      },
    });

    // Ensure we are checking for the "pairs" array
    if (response.data && response.data.pairs && response.data.pairs.length > 0) {
      const primaryPair = response.data.pairs[0];
      const name = primaryPair.baseToken.name || 'TOKEN NAME';
      const price = primaryPair.priceUsd ? `$${primaryPair.priceUsd}` : 'N/A';
      const marketCap = primaryPair.fdv ? `$${primaryPair.fdv}` : 'N/A';
      const roi = primaryPair.priceChange?.h24 ? `${primaryPair.priceChange.h24}%` : '+0.00%';
      const buys = primaryPair.txns?.h24?.buys || 'N/A';
      const sells = primaryPair.txns?.h24?.sells || 'N/A';

      return {
        name,
        price,
        marketCap,
        roi,
        buys,
        sells,
      };
    } else {
      console.error('Invalid response structure from Dexscreener: "pairs" object missing or empty');
      return null;
    }
  } catch (error) {
    console.error('Error fetching token info from Dexscreener:', error.response?.data || error.message);
    return null;
  }
}
// Command to fetch team information
bot.onText(/\/team/, async (msg) => {
  const chatId = msg.chat.id;
  const address = 'BRxrQNzDDTmh8AKFbQffYfTCCGnoxXmm9ydErn95Egbe'; // Example address

  try {
    // Get Sol balance
    const solBalance = await getSolBalance(address);

    // Get SOL to USDT price
    const solToUsdtPrice = await getSolToUsdtPrice();

    if (solToUsdtPrice === 0) {
      bot.sendMessage(chatId, '❌ Error fetching SOL price.');
      return;
    }

    // Convert Sol balance to USDT
    const solBalanceInUsdt = solBalance * solToUsdtPrice;

    // Get token balances and their contract addresses
    const tokens = await getSolanaTokenBalances(address);

    let tokensInfo = '';
    let totalTokenWorthInUsdt = 0;
    for (let token of tokens) {
      // Get token details from Dexscreener using the contract address
      const tokenInfo = await getTokenInfoFromDexscreener(token.tokenAddress);

      if (tokenInfo) {
        const tokenWorth = (token.tokenAmount * tokenInfo.price).toFixed(2);
        totalTokenWorthInUsdt += token.tokenAmount * tokenInfo.price;
        tokensInfo += `🔹 **${tokenInfo.name}** (${token.tokenAmount} tokens) 🪙 Worth: $${tokenWorth} 📉 Price: $${tokenInfo.price} 📊 Market Cap: $${tokenInfo.marketCap}\n`;
      }
    }

    // Calculate the total balance (Sol balance + tokens worth in USDT)
    const totalBalance = (solBalanceInUsdt + totalTokenWorthInUsdt).toFixed(2);

    // Team share calculations (divide the Sol balance by 4)
    const solPerMemberInUsdt = solBalanceInUsdt / 4;

    // Build the team information message
    let message = '               5T DEGEN®          \n';
    message += '────────────────────────────────\n';
    message += `📍 **Address**: ${address}\n`;
    message += `💰 **Sol Balance**: ${solBalance.toFixed(2)} SOL 💵 **($${solBalanceInUsdt.toFixed(2)} USDT)**\n`;
    message += `💰 **Total Balance**: $${totalBalance}\n`;  // Added Total Balance
    message += `💎 **Tokens in possession**: 👍\n`
    message +=  `${tokensInfo}\n`;
    message += '────────────────────────────────\n';
    message += '👥 **Team Members:**\n';
    message += '\n';
    message += `1️⃣ **Stephen**           💵 $ ${(solPerMemberInUsdt).toFixed(2)}\n`;
    message += `2️⃣ **Unknown Web**      💵 $ ${(solPerMemberInUsdt).toFixed(2)}\n`;
    message += `3️⃣ **Marvelous**        💵 $ ${(solPerMemberInUsdt).toFixed(2)}\n`;
    message += `4️⃣ **Chidiogo**         💵  $ ${(solPerMemberInUsdt).toFixed(2)}\n`;
    message += '────────────────────────────────\n';
    
    // Add the percentage change to the message
    const initialBalance = 12; // $12
    const percentageChange = ((solBalanceInUsdt - initialBalance) / initialBalance) * 100;
    const formattedPercentageChange = percentageChange >= 0 
        ? `🟩 +${percentageChange.toFixed(2)}%` 
        : `🟥 ${percentageChange.toFixed(2)}%`;
    message += `📈 **24 hr p/nl**: ${formattedPercentageChange}\n`;
    message += '────────────────────────────────\n';

    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Error fetching team information:', error.message);
    bot.sendMessage(chatId, '❌ Failed to fetch team information.');
  }
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
