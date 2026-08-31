const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

// --- 1. ENVIRONMENT & CLIENT SETUP ---
const token = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const webAppUrl = process.env.WEB_APP_URL || process.env.AROVAQ_MINI_APP_URL || 'https://arovaq-landingpage.vercel.app';

if (!token) {
    console.error('BOT_TOKEN / TELEGRAM_BOT_TOKEN environment variable is missing!');
    process.exit(1);
}

const bot = new Telegraf(token);
const supabase = createClient(supabaseUrl, supabaseKey);

// --- 2. EXPRESS SERVER FOR RENDER HEALTH CHECKS ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Arovaq Bot is running live and healthy!');
});

app.listen(PORT, () => {
    console.log(`HTTP health check server listening on port ${PORT}`);
});

// --- 3. BOT COMMAND HANDLERS ---

// /start command: Registers user and tracks referral deep links
bot.command('start', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const username = ctx.from.username || 'user_' + userId;
        const startPayload = ctx.payload;

        await supabase.from('profiles').upsert({
            telegram_id: String(userId),
            username: username,
            role: 'creator'
        }, { onConflict: 'telegram_id' });

        await supabase.from('affiliates').upsert({
            telegram_id: String(userId),
            username: username,
            referred_by: startPayload ? String(startPayload) : null
        }, { onConflict: 'telegram_id' });

        const welcomeMessage = `👋 Welcome to AROVAQ — VERIFIED VALUE.\n\n` +
            `A connected digital marketplace where creators, sellers, buyers, and affiliates meet.\n\n` +
            `✨ Create\n📦 Sell\n🛒 Buy\n📈 Earn\n\n` +
            `🔒 Your account is securely bound to your unique Telegram ID (${userId}) for verified product access.`;

        await ctx.reply(welcomeMessage, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🚀 Open Arovaq Mini App', web_app: { url: webAppUrl } }],
                    [{ text: '📁 Categories', callback_data: 'btn_categories' }, { text: '🏆 Rankings', callback_data: 'btn_rankings' }],
                    [{ text: '📦 List Product', callback_data: 'btn_list' }]
                ]
            }
        });
    } catch (err) {
        console.error('Error in /start command:', err);
        await ctx.reply('⚠️ Welcome! An error occurred while setting up your profile.');
    }
});

// /leaderboard command: Plain text format to prevent underscore parsing errors
bot.command('leaderboard', async (ctx) => {
    try {
        let message = `🏆 AROVAQ Pre-Launch Network Rankings 🏆\n\n`;

        message += `👥 Top Affiliates\n` +
                   `1. @kim_l — $1,420\n` +
                   `2. @baze_ke — $980\n` +
                   `3. @startups — $650\n\n`;

        message += `🚀 Top Creators\n` +
                   `1. @alpha_edu — $2,890\n` +
                   `2. @masterclass — $1,750\n` +
                   `3. @vectorfx — $1,120\n\n`;

        message += `💡 Pre-Launch Note\n` +
                   `15-month reward window active.\n` +
                   `5% foundational yield starting from listing date.\n\n` +
                   `✨ VERIFIED VALUE.`;

        await ctx.reply(message);
    } catch (err) {
        console.error('Error in /leaderboard:', err);
        await ctx.reply('⚠️ Unable to load leaderboard right now.');
    }
});

// /categories command: Synchronized with Mini App featured drops
bot.command('categories', async (ctx) => {
    try {
        let message = `📁 AROVAQ Curated Categories & Drops\n\n` +
                      `1. Future Express: The Decentralized Age — $8 / KES 1,040\n` +
                      `2. Creator Economy Blueprint 2026 — $15 / KES 1,950\n\n` +
                      `🚀 Open the Mini App below to explore full collections and buy instantly!`;

        await ctx.reply(message, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🚀 Open Arovaq Mini App', web_app: { url: webAppUrl } }]
                ]
            }
        });
    } catch (err) {
        console.error('Error in /categories:', err);
        await ctx.reply('⚠️ Error loading categories.');
    }
});

// /list command: Directs users to list items
bot.command('list', async (ctx) => {
    await ctx.reply(
        `📦 List Your Digital Product or Service\n\n` +
        `To list your assets on Arovaq and secure your foundational yield, open the Mini App below.`,
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🚀 Open Arovaq Mini App to List', web_app: { url: webAppUrl } }]
                ]
            }
        }
    );
});

// --- 4. CALLBACK BUTTON HANDLERS ---
bot.action('btn_categories', async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.reply('Type /categories to browse active product shelves.');
});

bot.action('btn_rankings', async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.reply('Type /leaderboard to view live network rankings.');
});

bot.action('btn_list', async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.reply('Type /list to start listing your product.');
});

// --- 5. LAUNCH BOT ---
bot.launch().then(() => {
    console.log('🤖 Arovaq Telegram Bot successfully launched and polling!');
}).catch(err => {
    console.error('Failed to launch bot:', err);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));