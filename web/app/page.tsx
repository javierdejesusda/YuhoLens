import { Hero } from "@/components/sections/hero";
import { Problem } from "@/components/sections/problem";
import { HowItWorks } from "@/components/sections/how-it-works";
import { ReproducibilityLedger } from "@/components/sections/reproducibility-ledger";
import { HardwareFit } from "@/components/sections/hardware-fit";
import { AccessCta } from "@/components/sections/access-cta";
import { SiteFooter } from "@/components/sections/site-footer";
import { KanjiField } from "@/components/canvas/kanji-field";
import { ReadAlongMount } from "@/components/sections/readalong-mount";

export default function Home() {
  return (
    <>
      <KanjiField />
      <main id="main-content" tabIndex={-1}>
        <Hero />
        <Problem />
        <HowItWorks />
        <ReadAlongMount />
        <ReproducibilityLedger />
        <HardwareFit />
        <AccessCta />
      </main>
      <SiteFooter />
    </>
  );
}
