import { Hero } from "@/components/sections/hero";
import { Problem } from "@/components/sections/problem";
import { HowItWorks } from "@/components/sections/how-it-works";
import { ReproducibilityLedger } from "@/components/sections/reproducibility-ledger";
import { HardwareFit } from "@/components/sections/hardware-fit";
import { Dag } from "@/components/sections/dag";
import { Kg2Arc } from "@/components/sections/kg2-arc";
import { ReportsRail } from "@/components/sections/reports-rail";
import { Manifest } from "@/components/sections/manifest";
import { Faq } from "@/components/sections/faq";
import { AccessCta } from "@/components/sections/access-cta";
import { SiteFooter } from "@/components/sections/site-footer";
import { KanjiField } from "@/components/canvas/kanji-field";
import { LiveDemoMount } from "@/components/sections/live-demo-mount";
import { ReadAlongMount } from "@/components/sections/readalong-mount";
import { FailureGalleryMount } from "@/components/sections/failure-gallery-mount";

export default function Home() {
  return (
    <>
      <KanjiField />
      <main id="main-content" tabIndex={-1}>
        <Hero />
        <Problem />
        <HowItWorks />
        <ReproducibilityLedger />
        <LiveDemoMount />
        <HardwareFit />
        <Dag />
        <ReadAlongMount />
        <Kg2Arc />
        <ReportsRail />
        <FailureGalleryMount />
        <Manifest />
        <Faq />
        <AccessCta />
      </main>
      <SiteFooter />
    </>
  );
}
