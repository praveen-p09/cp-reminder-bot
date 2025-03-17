import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import schedule from "node-schedule";
import axios from "axios";
import express from "express";
import { DateTime } from "luxon";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const allowedHosts = [
  "atcoder.jp",
  "codeforces.com",
  "codechef.com",
  "leetcode.com",
  "geeksforgeeks.org",
  // "naukri.com/code360",
  // "luogu.com.cn",
];

// Fetch contest data from CList API
const fetchContests = async () => {
  try {
    const response = await axios.get(
      `https://clist.by/api/v4/json/contest/?username=${process.env.CLIST_USERNAME}&api_key=${process.env.CLIST_API_KEY}&upcoming=true&duration__lt=86400&order_by=start`
    );
    return response.data.objects;
  } catch (error) {
    console.error("Error fetching contests:", error);
    return [];
  }
};

// Fetch user subscriptions from database
const getUserSubscriptions = async () => {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("chat_id, timezone");
  if (error) {
    console.error("Error fetching subscriptions:", error);
    return [];
  }
  return data;
};

// Store or update user timezone in database
const setUserTimezone = async (chatId, timezone) => {
  await supabase
    .from("subscriptions")
    .upsert({ chat_id: chatId, timezone }, { onConflict: ["chat_id"] });
};

// Store subscription in database
const addSubscription = async (chatId) => {
  await supabase
    .from("subscriptions")
    .upsert({ chat_id: chatId }, { onConflict: ["chat_id"] });
};

// Remove subscription from database
const removeSubscription = async (chatId) => {
  await supabase.from("subscriptions").delete().match({ chat_id: chatId });
};

// Store sent reminders to prevent duplicate alerts for same contest
const storeSentReminder = async (
  chatId,
  contestId,
  reminderType,
  contestStart
) => {
  const { error } = await supabase.from("sent_reminders").insert({
    chat_id: chatId,
    contest_id: contestId,
    reminder_type: reminderType,
    contest_start: contestStart,
  });

  if (error) {
    console.error("❌ Error storing reminder:", error);
  } else {
    console.log(
      `✅ Reminder stored: chatId=${chatId}, contestId=${contestId}, type=${reminderType}, start=${contestStart}`
    );
  }
};

// Check if contest reminder was already sent
const wasReminderSent = async (
  chatId,
  contestId,
  reminderType,
  contestStart
) => {
  const { data, error } = await supabase
    .from("sent_reminders")
    .select("id")
    .eq("chat_id", chatId)
    .eq("contest_id", contestId)
    .eq("reminder_type", reminderType)
    .eq("contest_start", contestStart);

  if (error) {
    console.error("❌ Error checking sent reminder:", error);
    return false;
  }

  return data.length > 0;
};

// Delete expired contests from database
const deleteExpiredContests = async () => {
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("sent_reminders")
    .delete()
    .lt("contest_start", now);

  if (error) {
    console.error("Error deleting expired contests:", error);
  } else {
    console.log("✅ Expired contests removed.");
  }
};

// Command: Start
bot.onText(/\/start/, (msg) => {
  const username = msg.from.username
    ? `@${msg.from.username}`
    : msg.from.first_name || "User";

  bot.sendMessage(
    msg.chat.id,
    `👋 Hello, ${username}!\n\n` +
      `I'm **CP Reminder Bot**, your personal assistant for staying updated with upcoming coding contests! 🚀\n\n` +
      `🔹 **What I Do?**\n` +
      `- Send timely reminders for competitive programming contests.\n` +
      `- Support platforms like Codeforces, AtCoder, LeetCode, CodeChef, and more.\n` +
      `- Allow timezone customization to match your local time.\n\n` +
      `🔹 **How to Use?**\n` +
      `- ✅ Use **/subscribe** to start receiving contest reminders.\n` +
      `- 🌍 Use **/settimezone TZ_Identifier** to configure your timezone.\n` +
      `- ❌ Use **/unsubscribe** to stop receiving reminders.\n\n` +
      `🛠️ Created by [Praveen Chandra Patro](https://www.linkedin.com/in/praveen-chandra-patro-1a6a5a257)\n\n` +
      `Happy Coding! 🚀`
  );
});

// Command: Subscribe
bot.onText(/\/subscribe/, async (msg) => {
  await addSubscription(msg.chat.id);
  bot.sendMessage(
    msg.chat.id,
    "✅ Subscribed! You'll receive contest reminders."
  );
});

// Command: Unsubscribe
bot.onText(/\/unsubscribe/, async (msg) => {
  await removeSubscription(msg.chat.id);
  bot.sendMessage(msg.chat.id, "❌ Unsubscribed! You won't receive reminders.");
});

// Command: Set Timezone
bot.onText(/\/settimezone (.+)/, async (msg, match) => {
  const timezone = match[1].trim();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    await setUserTimezone(msg.chat.id, timezone);
    bot.sendMessage(msg.chat.id, `🌍 Timezone set to ${timezone}`);
  } catch {
    bot.sendMessage(
      msg.chat.id,
      "⚠️ Invalid timezone. Use a valid identifier."
    );
  }
});

// Enable command suggestions
bot.setMyCommands([
  { command: "start", description: "Start the bot and see usage instructions" },
  { command: "subscribe", description: "Subscribe to contest reminders" },
  { command: "unsubscribe", description: "Unsubscribe from contest reminders" },
  {
    command: "settimezone",
    description:
      "Set your timezone for accurate reminders by writing TZ identifier(eg: Asia/Kolkata)",
  },
]);

// Schedule Job every 10 minutes : send reminders and delete expired contests
schedule.scheduleJob("*/10 * * * *", async () => {
  console.log(
    "🔄 Running scheduled job: Sending reminders & deleting expired contests"
  );

  const contests = await fetchContests();
  const subscribers = await getUserSubscriptions();

  for (const { chat_id, timezone } of subscribers) {
    for (const contest of contests) {
      if (!allowedHosts.includes(contest.host)) continue;

      const contestId = contest.id;
      const startTime = DateTime.fromISO(contest.start, {
        zone: "utc",
      }).setZone(timezone);
      const hoursLeft = startTime.diffNow("hours").hours;

      if (
        hoursLeft <= 24 &&
        hoursLeft > 1 &&
        !(await wasReminderSent(chat_id, contestId, "24hr", contest.start))
      ) {
        await storeSentReminder(chat_id, contestId, "24hr", contest.start);
        sendTelegramMessage(
          chat_id,
          `⏳ **Reminder:** Contest within 24 hours!\n${formatContestMessage(
            contest,
            timezone
          )}`
        );
      }

      if (
        hoursLeft <= 1 &&
        !(await wasReminderSent(chat_id, contestId, "1hr", contest.start))
      ) {
        await storeSentReminder(chat_id, contestId, "1hr", contest.start);
        sendTelegramMessage(
          chat_id,
          `🔥 **Reminder:** Contest starts within an hour!\n${formatContestMessage(
            contest,
            timezone
          )}`
        );
      }
    }
  }

  await deleteExpiredContests();
  console.log("✅ Expired contests deleted.");
});

// format contest message with timezone conversion
const formatContestMessage = (contest, timezone) => {
  const startTime = DateTime.fromISO(contest.start, { zone: "utc" })
    .setZone(timezone)
    .toFormat("yyyy-MM-dd HH:mm:ss ZZZZ");

  const endTime = DateTime.fromISO(contest.end, { zone: "utc" })
    .setZone(timezone)
    .toFormat("yyyy-MM-dd HH:mm:ss ZZZZ");

  return `📢 **${contest.event}**\n🌐 **Platform:** ${
    contest.host
  }\n⏳ **Duration:** ${Math.round(
    contest.duration / 3600
  )} hours\n🕒 **Start:** ${startTime}\n🛑 **End:** ${endTime}\n🔗 **Join Here:** [${
    contest.host
  }](${contest.href})`;
};

// send messages to Telegram
const sendTelegramMessage = (chatId, message) => {
  bot.sendMessage(chatId, message, {
    parse_mode: "Markdown",
    disable_web_page_preview: true,
  });
};

// API Endpoints
app.get("/", (_, res) => res.send("Bot is running!"));
app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
