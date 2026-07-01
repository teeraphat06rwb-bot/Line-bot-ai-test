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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function replyFlex(replyToken: string, altText: string, contents: any): Promise<void> {
  await lineClient.replyMessage({
    replyToken,
    messages: [{ type: "flex", altText, contents }],
  });
}

export function buildReplyBubble(text: string, isDefault = false) {
  const headerColor = isDefault ? "#e53935" : "#1565c0";
  const headerIcon = isDefault ? "🙏" : "🎗️";
  const headerLabel = isDefault ? "แจ้งเจ้าหน้าที่" : "น้องใส่ใจ";

  return {
    type: "bubble",
    header: {
      type: "box",
      layout: "horizontal",
      backgroundColor: headerColor,
      paddingAll: "14px",
      spacing: "md",
      contents: [
        {
          type: "text",
          text: `${headerIcon} ${headerLabel}`,
          color: "#ffffff",
          weight: "bold",
          size: "sm",
          flex: 1,
        },
        {
          type: "text",
          text: "ศูนย์โรคมะเร็ง รพ.จุฬารัตน์ 3",
          color: "#ffffffbb",
          size: "xxs",
          align: "end",
          gravity: "center",
          flex: 2,
          wrap: true,
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      paddingAll: "18px",
      spacing: "none",
      contents: [
        {
          type: "text",
          text: text,
          wrap: true,
          size: "sm",
          color: "#222222",
          lineSpacing: "6px",
        },
      ],
    },
    footer: {
      type: "box",
      layout: "horizontal",
      paddingAll: "12px",
      backgroundColor: "#f5f5f5",
      spacing: "sm",
      contents: [
        {
          type: "button",
          style: "secondary",
          height: "sm",
          flex: 1,
          action: {
            type: "postback",
            label: "👨‍⚕️ ดูแพทย์",
            data: "action=show_doctors",
            displayText: "ดูรายชื่อแพทย์",
          },
        },
        {
          type: "button",
          style: "primary",
          color: "#1565c0",
          height: "sm",
          flex: 1,
          action: {
            type: "uri",
            label: "🌐 เว็บไซต์",
            uri: "https://www.chularat3inter.com",
          },
        },
      ],
    },
  };
}
