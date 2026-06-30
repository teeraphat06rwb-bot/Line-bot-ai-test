import { messagingApi } from "@line/bot-sdk";

export const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
});

export async function replyText(replyToken: string, text: string): Promise<void> {
  await lineClient.replyMessage({
    replyToken,
    messages: [{ type: "text", text }],
  });
}
