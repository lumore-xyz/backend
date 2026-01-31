import "dotenv/config";
import connectDB from "../config/db.js";
import { Prompt } from "../models/prompt.model.js";
import { PROMPTS } from "./data/prompts.js";

const seedPrompts = async () => {
  try {
    await connectDB();

    let created = 0;
    let skipped = 0;

    for (const prompt of PROMPTS) {
      const exists = await Prompt.findOne({
        text: prompt.text,
        category: prompt.category,
      });

      if (exists) {
        skipped++;
        continue;
      }

      await Prompt.create(prompt);
      created++;
    }

    console.log("✅ Prompt seeding complete");
    console.log(`➕ Created: ${created}`);
    console.log(`⏭️ Skipped (already exists): ${skipped}`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding prompts:", error);
    process.exit(1);
  }
};

seedPrompts();
