const {
  Client,
  Collection,
  GatewayIntentBits,
  EmbedBuilder,
  SlashCommandBuilder,
} = require("discord.js");
const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v10");
const keep_alive = require("./keep_alive");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
  ],
});

// Configuration
const TOKEN =
  "MTMyNDUzNzI3NzcyNDA5ODU5MA.GQSSrB.epzGu3_1hpktUIIm-0pOZvB9W7MJ12rbCCXeLA";
const CLIENT_ID = "1324537277724098590";
const GUILD_ID = "1135452057676021822";
const TARGET_CHANNEL_ID = "1175257706966302870";
const ADMIN_ROLE_ID = "1135461080546685010";
const GAMENIGHT_HOST_ROLE_ID = "1137346412418437140";

// Tracking variables
let isTracking = false;
let trackingData = new Map();
let trackedUsers = new Set();

// Permission check function
function hasPermission(member) {
  return (
    member.roles.cache.has(ADMIN_ROLE_ID) ||
    member.roles.cache.has(GAMENIGHT_HOST_ROLE_ID)
  );
}

// Delete old commands and register new ones
async function deleteOldCommands() {
  try {
    const commands = await client.application.commands.fetch();

    for (const command of commands.values()) {
      await client.application.commands.delete(command.id);
    }

    console.log('Successfully deleted all old slash commands.');
  } catch (error) {
    console.error('Error deleting old commands:', error);
  }
}

const ROLE_BOOSTS = new Map([
  ["1252840855874699285", 25], // PGP
  ["1137346412418437140", 100], //Gamenight Host
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
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("endtracking")
    .setDescription("End tracking and show results"),
  new SlashCommandBuilder()
    .setName("adduser")
    .setDescription("Add a user to track")
    .addUserOption((option) =>
      option.setName("user").setDescription("User to track").setRequired(true),
    ),
];

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  
  // Define 'rest' object here
  const rest = new REST({ version: "9" }).setToken(TOKEN);

  try {
    await deleteOldCommands();
    console.log("Started refreshing application (/) commands.");

    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands,
    });
    console.log("Successfully registered new commands.");
  } catch (error) {
    console.error(error);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;

  // Check permissions before executing any command
  if (!hasPermission(interaction.member)) {
    return await interaction.reply({
      content: "You need to be an Admin or Gamenight Host to use this command!",
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

async function handleStartTracking(interaction) {
  if (isTracking) {
    return await interaction.reply("Tracking is already active!");
  }

  const voiceChannel = interaction.guild.channels.cache.get(TARGET_CHANNEL_ID);
  if (!voiceChannel) {
    return await interaction.reply("Could not find the target voice channel!");
  }

  isTracking = true;
  const currentTime = Date.now();

  const userToTrack = interaction.options.getUser("user");
  if (userToTrack) {
    trackedUsers.add(userToTrack.id);
  }

  // Add currently present members
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
    .setTitle("Voice Tracking Started")
    .setColor("#00FF00")
    .setDescription(`Started tracking in ${voiceChannel.name}`)
    .addFields(
      {
        name: "Tracking Mode",
        value: userToTrack
          ? `Tracking specific user: ${userToTrack.tag}`
          : "Tracking all users",
      },
      { name: "Active Tracked Users", value: `${trackingData.size}` },
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleEndTracking(interaction) {
  if (!isTracking) {
    return await interaction.reply("No active tracking session!");
  }

  const currentTime = Date.now();
  const results = [];
  let currentEmbed = new EmbedBuilder()
    .setTitle("Voice Tracking Results")
    .setColor("#0099FF")
    .setDescription("Here are the results for this session:")
    .setTimestamp();

  let fieldCount = 0;
  let currentCharCount = 0;
  const CHAR_LIMIT = 1000;
  let totalSeconds = 0;
  let totalCoins = 0;

  const createNewEmbed = () => {
    results.push(currentEmbed);
    currentEmbed = new EmbedBuilder()
      .setTitle("Voice Tracking Results (Continued)")
      .setColor("#0099FF")
      .setTimestamp();
    fieldCount = 0;
    currentCharCount = 0;
  };

  for (const [userId, data] of trackingData) {
    const member = interaction.guild.members.cache.get(userId);
    if (!member) continue;

    let finalSeconds = data.totalTime;
    if (data.startTime) {
      finalSeconds += (currentTime - data.startTime) / 1000;
    }

    const hours = Math.floor(finalSeconds / 3600);
    const minutes = Math.floor((finalSeconds % 3600) / 60);
    const seconds = Math.floor(finalSeconds % 60);

    let timeString = "";
    if (hours > 0) timeString += `${hours}h `;
    if (minutes > 0 || hours > 0) timeString += `${minutes}m `;
    timeString += `${seconds}s`;

    let coins = Math.floor(finalSeconds / 600) * 25;

    let boost = 0;
    member.roles.cache.forEach((role) => {
      if (ROLE_BOOSTS.has(role.id)) {
        boost += ROLE_BOOSTS.get(role.id);
      }
    });

    if (boost > 0) {
      coins = Math.floor(coins * (1 + boost / 100));
    }

    totalSeconds += finalSeconds;
    totalCoins += coins;

    const fieldContent = `<@${userId}>\nTime: ${timeString}\nCoins: ${coins}${boost > 0 ? ` (${boost}% boost)` : ""}`;
    const fieldSize = fieldContent.length + member.user.tag.length;

    if (currentCharCount + fieldSize > CHAR_LIMIT || fieldCount >= 25) {
      createNewEmbed();
    }

    currentEmbed.addFields({
      name: `${member.user.tag}`,
      value: fieldContent,
      inline: true,
    });

    fieldCount++;
    currentCharCount += fieldSize;
  }

  const totalHours = Math.floor(totalSeconds / 3600);
  const totalMinutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = Math.floor(totalSeconds % 60);

  let totalTimeString = "";
  if (totalHours > 0) totalTimeString += `${totalHours}h `;
  if (totalMinutes > 0 || totalHours > 0)
    totalTimeString += `${totalMinutes}m `;
  totalTimeString += `${remainingSeconds}s`;

  const totalStatsField = {
    name: "Total Stats",
    value: `Total Time: ${totalTimeString}\nTotal Coins: ${totalCoins}`,
  };

  if (currentCharCount + totalStatsField.value.length > CHAR_LIMIT) {
    createNewEmbed();
  }

  currentEmbed.addFields(totalStatsField);
  results.push(currentEmbed);

  try {
    await interaction.reply({ embeds: [results[0]] });
    for (let i = 1; i < results.length; i++) {
      await interaction.followUp({ embeds: [results[i]] });
    }
  } catch (error) {
    console.error("Error sending results:", error);
    await interaction.reply(
      "An error occurred while sending the results. Please try again.",
    );
  }

  isTracking = false;
  trackingData.clear();
  trackedUsers.clear();
}

async function handleAddUser(interaction) {
  if (!isTracking) {
    return await interaction.reply("No active tracking session!");
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

  await interaction.reply(`Now tracking user: ${user.tag}`);
}

client.on("voiceStateUpdate", (oldState, newState) => {
  if (!isTracking) return;

  const userId = newState.member.id;

  if (trackedUsers.size > 0 && !trackedUsers.has(userId)) return;

  if (
    newState.channelId === TARGET_CHANNEL_ID &&
    oldState.channelId !== TARGET_CHANNEL_ID
  ) {
    trackingData.set(userId, {
      startTime: Date.now(),
      username: newState.member.user.tag,
      totalTime: trackingData.get(userId)?.totalTime || 0,
    });
  }

  if (
    oldState.channelId === TARGET_CHANNEL_ID &&
    newState.channelId !== TARGET_CHANNEL_ID
  ) {
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

client.login(TOKEN);
