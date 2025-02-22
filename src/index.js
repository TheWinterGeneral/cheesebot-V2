const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  SlashCommandBuilder,
} = require("discord.js");
const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v10");
const keep_alive = require("./keep_alive");

// Ensure you use an environment variable for your token (DO NOT hardcode it)
require("dotenv").config();
const TOKEN = process.env.TOKEN;
const CLIENT_ID = "1324537277724098590";
const GUILD_ID = "1135452057676021822";
const TARGET_CHANNEL_ID = "1175257706966302870";
const ADMIN_ROLE_ID = "1135461080546685010";
const GAMENIGHT_HOST_ROLE_ID = "1137346412418437140";

// Ensure the bot has the right intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
  ],
});

// Tracking variables
let isTracking = false;
let trackingData = new Map();
let trackedUsers = new Set();

const ROLE_BOOSTS = new Map([
  ["1252840855874699285", 25], // PGP
  ["1137346412418437140", 100], // Gamenight Host
  ["1137313565481648150", 50],
]);

const commands = [
  new SlashCommandBuilder()
    .setName("starttracking")
    .setDescription("Start tracking voice channel activity")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User to track (optional)")
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("endtracking")
    .setDescription("End tracking and show results"),
  new SlashCommandBuilder()
    .setName("adduser")
    .setDescription("Add a user to track")
    .addUserOption((option) =>
      option.setName("user").setDescription("User to track").setRequired(true)
    ),
];

// Function to delete old commands
async function deleteOldCommands() {
  try {
    const commands = await client.application.commands.fetch();
    for (const command of commands.values()) {
      await client.application.commands.delete(command.id);
    }
    console.log("Successfully deleted all old slash commands.");
  } catch (error) {
    console.error("Error deleting old commands:", error);
  }
}

// Permission check function
function hasPermission(member) {
  return (
    member.roles.cache.has(ADMIN_ROLE_ID) ||
    member.roles.cache.has(GAMENIGHT_HOST_ROLE_ID)
  );
}

// Bot startup event
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  try {
    await deleteOldCommands();
    console.log("Refreshing application (/) commands...");
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands,
    });
    console.log("✅ Successfully registered new commands.");
  } catch (error) {
    console.error("Error registering commands:", error);
  }
});

// Handle slash commands
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;

  if (!hasPermission(interaction.member)) {
    return await interaction.reply({
      content: "🚫 You need to be an Admin or Gamenight Host to use this command!",
      ephemeral: true,
    });
  }

  switch (interaction.commandName) {
    case "starttracking":
      await handleStartTracking(interaction);
      break;
    case "endtracking":
      await handleEndTracking(interaction);
      break;
    case "adduser":
      await handleAddUser(interaction);
      break;
  }
});

// Function to start tracking
async function handleStartTracking(interaction) {
  if (isTracking) {
    return await interaction.reply("⚠️ Tracking is already active!");
  }

  const voiceChannel = interaction.guild.channels.cache.get(TARGET_CHANNEL_ID);
  if (!voiceChannel) {
    return await interaction.reply("❌ Could not find the target voice channel!");
  }

  isTracking = true;
  const currentTime = Date.now();
  const userToTrack = interaction.options.getUser("user");

  if (userToTrack) {
    trackedUsers.add(userToTrack.id);
  }

  voiceChannel.members.forEach((member) => {
    if (trackedUsers.size === 0 || trackedUsers.has(member.id)) {
      trackingData.set(member.id, {
        startTime: currentTime,
        username: member.user.tag,
        totalTime: 0,
      });
    }
  });

  const embed = new EmbedBuilder()
    .setTitle("✅ Voice Tracking Started")
    .setColor("#00FF00")
    .setDescription(`Tracking started in ${voiceChannel.name}`)
    .addFields(
      { name: "Tracking Mode", value: userToTrack ? `Specific user: ${userToTrack.tag}` : "All users" },
      { name: "Active Tracked Users", value: `${trackingData.size}` }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

// Function to end tracking
async function handleEndTracking(interaction) {
  if (!isTracking) {
    return await interaction.reply("⚠️ No active tracking session!");
  }

  isTracking = false;
  trackingData.clear();
  trackedUsers.clear();

  await interaction.reply("✅ Tracking session ended and results have been logged.");
}

// Function to add a user to tracking
async function handleAddUser(interaction) {
  if (!isTracking) {
    return await interaction.reply("⚠️ No active tracking session!");
  }

  const user = interaction.options.getUser("user");
  trackedUsers.add(user.id);

  const member = interaction.guild.members.cache.get(user.id);
  const voiceChannel = interaction.guild.channels.cache.get(TARGET_CHANNEL_ID);

  if (member && voiceChannel && member.voice.channelId === TARGET_CHANNEL_ID) {
    trackingData.set(user.id, {
      startTime: Date.now(),
      username: user.tag,
      totalTime: 0,
    });
  }

  await interaction.reply(`✅ Now tracking user: ${user.tag}`);
}

// Voice State Update Listener
client.on("voiceStateUpdate", (oldState, newState) => {
  if (!isTracking) return;

  const userId = newState.member.id;

  if (trackedUsers.size > 0 && !trackedUsers.has(userId)) return;

  if (newState.channelId === TARGET_CHANNEL_ID && oldState.channelId !== TARGET_CHANNEL_ID) {
    trackingData.set(userId, {
      startTime: Date.now(),
      username: newState.member.user.tag,
      totalTime: trackingData.get(userId)?.totalTime || 0,
    });
  }

  if (oldState.channelId === TARGET_CHANNEL_ID && newState.channelId !== TARGET_CHANNEL_ID) {
    const userData = trackingData.get(userId);
    if (userData && userData.startTime) {
      const timeSpent = (Date.now() - userData.startTime) / 1000;
      trackingData.set(userId, {
        startTime: null,
        username: userData.username,
        totalTime: (userData.totalTime || 0) + timeSpent,
      });
    }
  }
});

// Ensure bot logs in at the end
client.login(TOKEN).then(() => {
  console.log("✅ Bot successfully logged in!");
}).catch(err => {
  console.error("❌ Login failed:", err);
});
