import { Hero } from "@/components/sections/hero";
import { Problem } from "@/components/sections/problem";
import { HowItWorks } from "@/components/sections/how-it-works";
import { ReproducibilityLedger } from "@/components/sections/reproducibility-ledger";
import { LiveDemo } from "@/components/sections/live-demo";
import { HardwareFit } from "@/components/sections/hardware-fit";
import { Dag } from "@/components/sections/dag";
import { ReadAlong } from "@/components/sections/readalong";
import { Kg2Arc } from "@/components/sections/kg2-arc";
import { ReportsRail } from "@/components/sections/reports-rail";
import { FailureGallery } from "@/components/sections/failure-gallery";
import { Manifest } from "@/components/sections/manifest";
import { Faq } from "@/components/sections/faq";
import { AccessCta } from "@/components/sections/access-cta";
import { SiteFooter } from "@/components/sections/site-footer";
import WebGLStageMount from "@/components/canvas/webgl-stage-mount";

export default function Home() {
  return (
    <>
      <WebGLStageMount />
      <main id="main-content" tabIndex={-1}>
        <Hero />
        <Problem />
        <HowItWorks />
        <ReproducibilityLedger />
        <LiveDemo />
        <HardwareFit />
        <Dag />
        <ReadAlong />
        <Kg2Arc />
        <ReportsRail />
        <FailureGallery />
        <Manifest />
        <Faq />
        <AccessCta />
      </main>
      <SiteFooter />
    </>
  );
}
