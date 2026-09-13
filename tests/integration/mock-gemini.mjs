// Preloaded only by the isolated integration process; never imported by the app.
const original = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (String(url).startsWith("https://generativelanguage.googleapis.com/"))
    return Response.json({
      candidates: [
        {
          finishReason: "STOP",
          content: {
            parts: [
              {
                text: JSON.stringify({
                  title: "Imported bottle survey",
                  description: "Company requirements",
                  questions: [
                    {
                      field_key: "bottle_feedback",
                      section: "body",
                      type: "text",
                      presentation: "short_text",
                      prompt: "What do you value in a reusable bottle?",
                      required: true,
                      config: { version: 1, min: 1, max: 120 },
                    },
                  ],
                }),
              },
            ],
          },
        },
      ],
    });
  return original(url, options);
};
