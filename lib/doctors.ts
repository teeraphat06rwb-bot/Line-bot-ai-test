export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  expertise: string[];
  schedule: string;
  imageUrl: string;
}

export const DOCTORS: Doctor[] = [
  {
    id: "doc1",
    name: "นพ.สมชาย รักษาดี",
    specialty: "อายุรกรรมมะเร็ง",
    expertise: ["มะเร็งปอด", "มะเร็งตับ", "มะเร็งกระเพาะอาหาร", "เคมีบำบัด"],
    schedule: "จันทร์–ศุกร์  09:00–12:00 น.",
    imageUrl: "https://placehold.co/400x300/1a73e8/ffffff?text=นพ.สมชาย",
  },
  {
    id: "doc2",
    name: "พญ.สมหญิง ใจดี",
    specialty: "ศัลยกรรมมะเร็งเต้านม",
    expertise: ["มะเร็งเต้านม", "ผ่าตัดมะเร็งเต้านม", "ตรวจคัดกรองมะเร็งเต้านม"],
    schedule: "อังคาร–พฤหัส  13:00–16:00 น.",
    imageUrl: "https://placehold.co/400x300/e91e63/ffffff?text=พญ.สมหญิง",
  },
  {
    id: "doc3",
    name: "นพ.วิชัย หายเร็ว",
    specialty: "รังสีรักษา",
    expertise: ["รังสีรักษามะเร็ง", "IMRT", "VMAT", "Stereotactic Radiosurgery"],
    schedule: "จันทร์–พุธ–ศุกร์  10:00–14:00 น.",
    imageUrl: "https://placehold.co/400x300/388e3c/ffffff?text=นพ.วิชัย",
  },
  {
    id: "doc4",
    name: "พญ.นภา มั่นใจ",
    specialty: "มะเร็งวิทยานรีเวช",
    expertise: ["มะเร็งปากมดลูก", "มะเร็งรังไข่", "มะเร็งมดลูก", "ผ่าตัดผ่านกล้อง"],
    schedule: "อังคาร–ศุกร์  08:00–12:00 น.",
    imageUrl: "https://placehold.co/400x300/7b1fa2/ffffff?text=พญ.นภา",
  },
];

export function getDoctorById(id: string): Doctor | undefined {
  return DOCTORS.find((d) => d.id === id);
}

export function buildDoctorCarousel() {
  const bubbles = DOCTORS.map((doc) => ({
    type: "bubble",
    size: "kilo",
    hero: {
      type: "image",
      url: doc.imageUrl,
      size: "full",
      aspectRatio: "4:3",
      aspectMode: "cover",
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "16px",
      contents: [
        {
          type: "text",
          text: doc.name,
          weight: "bold",
          size: "md",
          color: "#1a1a1a",
          wrap: true,
        },
        {
          type: "text",
          text: `🎗️ ${doc.specialty}`,
          size: "sm",
          color: "#e91e63",
          wrap: true,
        },
        {
          type: "separator",
          margin: "sm",
          color: "#f0f0f0",
        },
        {
          type: "text",
          text: `🕐 ${doc.schedule}`,
          size: "xs",
          color: "#555555",
          wrap: true,
          margin: "sm",
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        {
          type: "button",
          style: "secondary",
          height: "sm",
          action: {
            type: "postback",
            label: "📋 ดูรายละเอียด",
            data: `action=view_doctor&id=${doc.id}`,
            displayText: `ขอดูรายละเอียด ${doc.name}`,
          },
        },
        {
          type: "button",
          style: "primary",
          color: "#1a73e8",
          height: "sm",
          action: {
            type: "postback",
            label: "📅 นัดพบแพทย์",
            data: `action=book_doctor&id=${doc.id}`,
            displayText: `อยากนัดพบ ${doc.name}`,
          },
        },
      ],
    },
  }));

  return { type: "carousel", contents: bubbles };
}

export function buildDoctorDetailBubble(doc: Doctor) {
  const expertiseItems = doc.expertise.map((item) => ({
    type: "box",
    layout: "horizontal",
    spacing: "sm",
    contents: [
      { type: "text", text: "✅", size: "sm", flex: 0 },
      { type: "text", text: item, size: "sm", color: "#333333", wrap: true, flex: 1 },
    ],
  }));

  return {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      paddingAll: "0px",
      contents: [
        {
          type: "image",
          url: doc.imageUrl,
          size: "full",
          aspectRatio: "16:9",
          aspectMode: "cover",
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      paddingAll: "20px",
      contents: [
        {
          type: "text",
          text: doc.name,
          weight: "bold",
          size: "lg",
          color: "#1a1a1a",
          wrap: true,
        },
        {
          type: "text",
          text: `🎗️ ${doc.specialty}`,
          size: "sm",
          color: "#e91e63",
          wrap: true,
        },
        { type: "separator", margin: "md", color: "#eeeeee" },
        {
          type: "text",
          text: "ความเชี่ยวชาญ",
          weight: "bold",
          size: "sm",
          color: "#1a73e8",
          margin: "md",
        },
        {
          type: "box",
          layout: "vertical",
          spacing: "xs",
          contents: expertiseItems,
        },
        { type: "separator", margin: "md", color: "#eeeeee" },
        {
          type: "box",
          layout: "horizontal",
          margin: "md",
          contents: [
            { type: "text", text: "🕐 ตารางออกตรวจ", size: "sm", color: "#555555", flex: 0 },
          ],
        },
        {
          type: "text",
          text: doc.schedule,
          size: "sm",
          color: "#333333",
          wrap: true,
          margin: "xs",
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#1a73e8",
          action: {
            type: "postback",
            label: "📅 นัดพบแพทย์ท่านนี้",
            data: `action=book_doctor&id=${doc.id}`,
            displayText: `อยากนัดพบ ${doc.name}`,
          },
        },
      ],
    },
  };
}
