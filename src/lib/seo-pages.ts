export type SeoLandingPage = {
  slug: string;
  title: string;
  description: string;
  eyebrow: string;
  headline: string;
  lede: string;
  note: string;
  guideTitle: string;
  guide: Array<{ heading: string; body: string }>;
  examplesTitle: string;
  examples: Array<{ label: string; text: string }>;
  faqs: Array<{ question: string; answer: string }>;
};

const pages: SeoLandingPage[] = [
  {
    slug: 'ai-blessing-generator',
    title: 'AI Blessing Generator — Write Meaningful Blessings Online | WishMeteor',
    description: 'Create a thoughtful AI blessing in seconds. Choose the occasion, recipient, tone, and language, then turn your words into a beautiful card.',
    eyebrow: 'AI blessing generator',
    headline: 'Find the words that make someone feel seen.',
    lede: 'Start with a feeling, a person, and a moment. WishMeteor helps you shape a blessing that sounds like you — then lets you make it into a card.',
    note: 'A little warmth, made personal.',
    guideTitle: 'A more thoughtful way to write a blessing',
    guide: [
      { heading: 'Begin with the person, not a template', body: 'A useful blessing names the relationship before it reaches for beautiful language. Share who it is for, the occasion, and one small detail that belongs to them. That gives the words a point of view.' },
      { heading: 'Choose a tone that fits the moment', body: 'Warm and sincere works well for family and close friends. Light-hearted can make a birthday feel playful. A poetic or quietly elegant tone gives weddings, anniversaries, and more reflective moments room to breathe.' },
      { heading: 'Edit until it sounds like your voice', body: 'AI can make the first draft easier; the final message should still feel like yours. Keep the line that feels true, remove anything that sounds too formal, and add a shared memory before you send it.' },
    ],
    examplesTitle: 'Three small beginnings',
    examples: [
      { label: 'For a friend', text: 'May this next chapter meet you with the same kindness and courage you bring to everyone around you. I am so lucky to be close enough to cheer you on.' },
      { label: 'For a new beginning', text: 'May the road ahead be gentle when you need rest, bright when you need hope, and full of small signs that you are moving in the right direction.' },
      { label: 'For someone far away', text: 'Even from a distance, I am holding you in my thoughts. May today bring you one clear reason to smile and a little more light than you expected.' },
    ],
    faqs: [
      { question: 'What is an AI blessing generator?', answer: 'It is a writing tool that helps you draft a blessing from a few details, such as the occasion, your relationship with the recipient, and the tone you want.' },
      { question: 'Can I change the generated blessing?', answer: 'Yes. Every version is editable, so you can shorten it, add a memory, or combine your favourite lines before making a card.' },
      { question: 'Can I write a blessing in another language?', answer: 'Yes. WishMeteor supports English, Chinese, Japanese, French, Russian, Spanish, Hindi, Portuguese, and Malay.' },
    ],
  },
  {
    slug: 'birthday-wishes',
    title: 'Birthday Wishes — Create a Personal Birthday Message with AI | WishMeteor',
    description: 'Create personal birthday wishes for friends, family, partners, and colleagues. Pick a tone, add a memory, and make a birthday card online.',
    eyebrow: 'Birthday wishes',
    headline: 'A birthday message should sound like you remembered.',
    lede: 'Whether the mood is bright, tender, funny, or quietly grateful, begin with a real detail and turn it into a birthday wish worth keeping.',
    note: 'For the year they are about to begin.',
    guideTitle: 'How to write a birthday wish that feels personal',
    guide: [
      { heading: 'Name the kind of year you hope they have', body: 'Instead of only wishing someone a happy birthday, point toward what you hope the coming year holds: rest, adventure, confidence, laughter, or a dream they have been working toward.' },
      { heading: 'Add one shared moment', body: 'A short reference to a trip, an inside joke, or the way they show up for others turns a general birthday line into a message only you could have sent.' },
      { heading: 'Match the closeness of your relationship', body: 'For a colleague, keep it warm and simple. For a partner or close friend, make space for gratitude and affection. For a milestone birthday, acknowledge the moment without making age the whole story.' },
    ],
    examplesTitle: 'Birthday wishes to make your own',
    examples: [
      { label: 'For a best friend', text: 'Happy birthday to the person who makes ordinary plans feel like stories I will keep. I hope this year gives you back a little of all the joy you give away.' },
      { label: 'For a parent', text: 'Happy birthday. Thank you for being the calm place I can always come back to. I hope the year ahead brings you slow mornings, good health, and plenty of reasons to feel proud.' },
      { label: 'For a colleague', text: 'Wishing you a very happy birthday and a year full of good momentum, meaningful work, and time for the things that recharge you.' },
    ],
    faqs: [
      { question: 'How long should a birthday message be?', answer: 'A few sincere lines are enough. Add one personal detail if you can; it often matters more than a long message.' },
      { question: 'What should I write for a milestone birthday?', answer: 'Celebrate the person and their next chapter. Mention a quality you admire, a memory, or a hope for the year rather than focusing only on the number.' },
      { question: 'Can I make a birthday card after writing the message?', answer: 'Yes. Choose a card style, review your message, and download a shareable image when it feels right.' },
    ],
  },
  {
    slug: 'wedding-wishes',
    title: 'Wedding Wishes — Write a Meaningful Wedding Card Message | WishMeteor',
    description: 'Write warm, elegant wedding wishes for the happy couple. Create a personal message, choose a card style, and download your wedding greeting.',
    eyebrow: 'Wedding wishes',
    headline: 'Wish them a life that feels like their own.',
    lede: 'A beautiful wedding message does not need grand language. It needs warmth, a sense of the couple, and a hopeful thought for the life they are building together.',
    note: 'For the promise, and every day after it.',
    guideTitle: 'A calm guide to wedding card messages',
    guide: [
      { heading: 'Write to the couple, not the occasion', body: 'Start with what you notice about them together: the ease they bring each other, the adventures they share, or the care that makes their relationship feel steady.' },
      { heading: 'Offer a wish for everyday life', body: 'The most lasting wishes are often simple. Hope for laughter after hard days, curiosity through new seasons, and a home where each person can keep becoming themselves.' },
      { heading: 'Keep humour kind and optional', body: 'An inside joke can be lovely when you know the couple well, but the message should still stand on its own as a sincere celebration of their commitment.' },
    ],
    examplesTitle: 'Wedding wishes with room to breathe',
    examples: [
      { label: 'Warm & timeless', text: 'May your life together be full of quiet joys, brave choices, and the comfort of knowing you have found a home in one another.' },
      { label: 'For close friends', text: 'Seeing the two of you choose each other has been such a joy. May your marriage hold all the laughter, honesty, and wonder that brought you here.' },
      { label: 'Short & elegant', text: 'Wishing you a lifetime of love that grows gentler, deeper, and more joyful with every season.' },
    ],
    faqs: [
      { question: 'What do you write in a wedding card?', answer: 'Congratulate the couple, name something you appreciate about them if you can, and offer a sincere hope for their life together.' },
      { question: 'Should wedding wishes be formal?', answer: 'Not necessarily. Match the couple and your relationship with them. A warm, clear message is more memorable than formality for its own sake.' },
      { question: 'Can I create a wedding card online?', answer: 'Yes. Draft your words with WishMeteor, select a visual theme, and download the finished card to share.' },
    ],
  },
  {
    slug: 'thank-you-messages',
    title: 'Thank You Messages — Write a Meaningful Thank You Note | WishMeteor',
    description: 'Create a heartfelt thank you message for a friend, teacher, colleague, host, or loved one. Turn your appreciation into a beautiful card online.',
    eyebrow: 'Thank you messages',
    headline: 'Gratitude lands differently when it is specific.',
    lede: 'You do not need perfect words to say thank you. Begin with what someone did, how it helped, and the small feeling you want them to carry away.',
    note: 'For the kindness that changed the day.',
    guideTitle: 'A simple formula for a genuine thank you',
    guide: [
      { heading: 'Say what you are thanking them for', body: 'Name the gift, the time, the advice, or the effort. Specificity makes a note feel considered, even when it is only a few sentences long.' },
      { heading: 'Share the impact', body: 'A great thank you explains why the kindness mattered. Perhaps it made a difficult week easier, helped you feel welcome, or gave you confidence at exactly the right time.' },
      { heading: 'Leave the door open warmly', body: 'Close with a simple wish, an offer to return the care, or a hope to see them soon. Keep it natural; gratitude does not need to turn into a debt.' },
    ],
    examplesTitle: 'Thank you messages for different moments',
    examples: [
      { label: 'For a friend', text: 'Thank you for showing up when I needed someone steady. You made a difficult day feel less lonely, and I will not forget that.' },
      { label: 'For a teacher', text: 'Thank you for seeing more in me than I could see for myself. Your patience and encouragement have stayed with me far beyond the classroom.' },
      { label: 'For a host', text: 'Thank you for making us feel so welcome. The thoughtful details, good conversation, and easy warmth of the evening meant a lot.' },
    ],
    faqs: [
      { question: 'How do I write a thank you message?', answer: 'Start by naming the kindness, add one sentence about its impact, then close with warm appreciation. Honest and specific is better than elaborate.' },
      { question: 'Can a thank you note be short?', answer: 'Absolutely. A concise message with one genuine detail can feel more personal than a long, generic note.' },
      { question: 'Who can I write a thank you card for?', answer: 'Anyone whose kindness, time, advice, hospitality, or support has mattered to you — from a close friend to a teacher or colleague.' },
    ],
  },
  {
    slug: 'anniversary-wishes',
    title: 'Anniversary Wishes — Create a Personal Anniversary Message | WishMeteor',
    description: 'Write romantic, warm, or elegant anniversary wishes for a partner, couple, friends, or family. Make a meaningful anniversary card online.',
    eyebrow: 'Anniversary wishes',
    headline: 'Mark the time, and the little things that made it matter.',
    lede: 'An anniversary is a chance to notice what has lasted: the shared routines, the hard-won growth, the laughter, and the choice to keep showing up.',
    note: 'For the story still being written.',
    guideTitle: 'Writing an anniversary message with feeling',
    guide: [
      { heading: 'Look back at one true detail', body: 'A memory gives an anniversary note its pulse. It could be a first trip, a familiar breakfast, a difficult season you came through, or simply the way they make home feel.' },
      { heading: 'Celebrate what has grown', body: 'The best anniversary wishes do not only say that time passed. They recognise the patience, trust, humour, and everyday care that let a relationship deepen.' },
      { heading: 'Look forward gently', body: 'End with a wish for more of what matters: new places, quieter mornings, courage for the unknown, or another year of choosing each other with attention.' },
    ],
    examplesTitle: 'Anniversary words to personalise',
    examples: [
      { label: 'For a partner', text: 'Another year with you has made the world feel both bigger and more like home. Thank you for every ordinary day you make meaningful.' },
      { label: 'For a couple', text: 'Happy anniversary. May the life you have built together keep making room for laughter, tenderness, and all the adventures still waiting for you.' },
      { label: 'For parents', text: 'Happy anniversary to two people who taught me that love can be patient, practical, and full of laughter at the same time.' },
    ],
    faqs: [
      { question: 'What makes a good anniversary wish?', answer: 'A good message includes one personal truth, appreciation for the relationship, and a hopeful line about the future.' },
      { question: 'What do I write for a wedding anniversary?', answer: 'Celebrate the couple or your partner, mention a quality or memory you admire, and wish them joy in the next chapter.' },
      { question: 'Can I make an anniversary card with my own words?', answer: 'Yes. Edit the message as much as you like, then choose a card style and download it when you are ready.' },
    ],
  },
  {
    slug: 'christmas-card-maker',
    title: 'Christmas Card Maker — Create a Personal Christmas Card Online | WishMeteor',
    description: 'Create a warm, personal Christmas card online. Write your message with AI, choose a festive visual style, and download a card to share.',
    eyebrow: 'Christmas card maker',
    headline: 'Send a little warmth through the winter.',
    lede: 'Write a Christmas message for family, friends, colleagues, or someone you miss. Start with a feeling and turn it into a card that looks considered, not copied.',
    note: 'For bright windows and familiar voices.',
    guideTitle: 'Make a Christmas card feel personal',
    guide: [
      { heading: 'Choose the feeling before the phrase', body: 'Do you want the card to feel cosy, joyful, reflective, or simple? A clear mood makes it easier to find words that suit the person receiving them.' },
      { heading: 'Include a small human detail', body: 'Mention a shared meal, a hoped-for visit, a favourite tradition, or a wish for rest. These details make a seasonal greeting feel like a real connection.' },
      { heading: 'Keep the audience in mind', body: 'For close family, be affectionate. For friends, let your shared voice show. For colleagues and clients, warm and concise is usually best. A considerate seasonal message leaves room for different traditions, too.' },
    ],
    examplesTitle: 'Christmas messages to adapt',
    examples: [
      { label: 'For family', text: 'Wishing you a Christmas full of slow mornings, familiar laughter, and the kind of togetherness that stays with you long after the lights come down.' },
      { label: 'For a friend', text: 'Sending you a little Christmas warmth from afar. I hope your days are peaceful, your table is full, and the new year brings you good surprises.' },
      { label: 'For colleagues', text: 'Wishing you a restful Christmas and a bright start to the new year. Thank you for the care and energy you brought to the year we shared.' },
    ],
    faqs: [
      { question: 'How do I make a Christmas card online?', answer: 'Write or generate your message, choose a card theme, review the words, and download the finished image to share digitally or print.' },
      { question: 'What should I write in a Christmas card?', answer: 'Wish the recipient warmth, rest, joy, or time with people they love. Add a small personal detail for a message that feels genuinely yours.' },
      { question: 'Can I use the card for friends or work?', answer: 'Yes. Adjust the tone for the relationship, from warm and personal for loved ones to concise and appreciative for colleagues.' },
    ],
  },
];

export const seoLandingPages = pages;
export const seoLandingSlugs = pages.map((page) => page.slug);
export function getSeoLandingPage(slug: string | undefined) {
  return pages.find((page) => page.slug === slug);
}

export const englishHomeSeo = {
  title: 'AI Blessing Generator & Greeting Card Maker | WishMeteor',
  description: 'Create AI blessings, wishes, and greeting cards online in your language. Make thoughtful words and beautiful cards in seconds.',
  ogTitle: 'AI Blessing Generator & Greeting Card Maker | WishMeteor',
  ogDescription: 'Create personal blessings, wishes, and greeting cards in seconds.',
  eyebrow: 'AI blessing generator & card maker',
  headline: 'Create AI blessings, wishes & greeting cards.',
  subtitle: 'Write a thoughtful blessing, make a wish, and turn your words into a beautiful card in seconds.',
};
