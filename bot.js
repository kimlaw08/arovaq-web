const { Telegraf, Markup } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

// Initialize environment variables with secure fallbacks
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ftheyucrrfblvgsceitd.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_KEY || 'YOUR_SUPABASE_KEY_HERE';
const MINIPAPP_URL = process.env.AROVAQ_MINI_PAPP_URL || 'https://arovaq-portal-2026.vercel.app/?v=2'; // Your live Vercel Mini App URL

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Minimal Express server to satisfy Render health checks and prevent port crashing
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Arovaq Bot Server is live and running!'));
app.listen(PORT, () => {
    console.log(`HTTP server listening on port ${PORT}`);
});

// --- TELEGRAM COMMAND HANDLERS ---

// /start command with interactive inline buttons
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const firstName = ctx.from.first_name || 'Creator';

    try {
        // Register or update user profile in Supabase
        await supabase.from('profiles').upsert([
            { telegram_id: userId, username: ctx.from.username || 'unknown', updated_at: new Date() }
        ], { onConflict: 'telegram_id' });
    } catch (err) {
        console.error('Error saving user profile to Supabase:', err);
    }

    await ctx.reply(
        `👋 Welcome to **Arovaq**, ${firstName}!\n\n` +
        `Your account is securely bound to your Telegram ID (\`${userId}\`) for verified digital asset access and monetization.\n\n` +
        `Choose an option below to explore the marketplace, list your assets, or manage your network:`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.webApp('🚀 Open Arovaq Mini App', MINIPAPP_URL)],
                [Markup.button.callback('📁 Categories', 'btn_categories'), Markup.button.callback('🏆 Rankings', 'btn_rankings')],
                [Markup.button.callback('📦 List Product', 'btn_list')]
            ])
        }
    );
});

// /ref command to generate custom referral links
bot.command('ref', async (ctx) => {
    const userId = ctx.from.id;
    const botUsername = ctx.botInfo ? ctx.botInfo.username : 'Arovaq_bot';
    const refLink = `https://t.me/${botUsername}?start=ref_${userId}`;

    await ctx.reply(
        `🔗 **Your Arovaq Referral Link**\n\n` +
        `Share this unique link with creators, sellers, and affiliates to expand your network:\n\n` +
        `\`${refLink}\`\n\n` +
        `Track your active network growth and earnings directly inside the Mini App!`,
        { parse_mode: 'Markdown' }
    );
});

// /list command for publishing assets
bot.command('list', async (ctx) => {
    await ctx.reply(
        `📦 **List Your Digital Product or Service**\n\n` +
        `To publish your assets on Arovaq with KES or USD pricing, launch our Mini App below:`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.webApp('📦 Open Mini App to List', MINIPAPP_URL)]
            ])
        }
    );
});

// /categories command
bot.command('categories', async (ctx) => {
    await ctx.reply(
        `📁 **Arovaq Curated Shelves & Categories**\n\n` +
        `Explore our active asset categories:\n` +
        `• 💻 Web3 & DeFi\n` +
        `• 📚 Digital Ebooks\n` +
        `• 🎓 Masterclasses\n` +
        `• 🛠️ Business Templates\n\n` +
        `Tap below to browse them live in the Mini App:`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.webApp('🔍 Explore Categories', MINIPAPP_URL)]
            ])
        }
    );
});

// /rankings command
bot.command('rankings', async (ctx) => {
    await ctx.reply(
        `🏆 **Pre-Launch Network Rankings**\n\n` +
        `Check out the top-performing creators and affiliates scaling up for the launch!`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.webApp('🏆 View Full Leaderboard', MINIPAPP_URL)]
            ])
        }
    );
});

// --- INLINE BUTTON CALLBACKS ---

bot.action('btn_categories', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('Tap below to open categories in the Mini App:', Markup.inlineKeyboard([
        [Markup.button.webApp('📁 Open Categories', MINIPAPP_URL)]
    ]));
});

bot.action('btn_rankings', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('Tap below to open network rankings in the Mini App:', Markup.inlineKeyboard([
        [Markup.button.webApp('🏆 Open Rankings', MINIPAPP_URL)]
    ]));
});

bot.action('btn_list', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('Tap below to list your product securely:', Markup.inlineKeyboard([
        [Markup.button.webApp('📦 Open Listing Form', MINIPAPP_URL)]
    ]));
});

// Start the bot polling loop
bot.launch();
console.log('Arovaq Bot is live and running...');

// Enable graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));