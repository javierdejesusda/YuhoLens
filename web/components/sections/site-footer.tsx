"use client";
import { SealStamp } from "@/components/ui/seal-stamp";

const LABLAB_URL = "https://lablab.ai/ai-hackathons/amd-developer";

export function SiteFooter() {
  return (
    <footer className="foot">
      <div className="foot-inner">
        <div className="foot-row foot-row--top">
          <div className="brand">
            YUHO<span className="dot">·</span>LENS
          </div>
          <div className="foot-license">
            <span className="foot-license__seal" aria-hidden="true">
              <span className="foot-license__seal-inner">
                <SealStamp state="verified" label="MIT licensed" />
              </span>
            </span>
            <span className="foot-license__copy">
              <span className="foot-license__title">MIT</span>
              <span className="foot-license__sub">code · open weights</span>
            </span>
          </div>
        </div>

        <div className="foot-row foot-row--mid">
          <a
            className="foot-link"
            href="https://huggingface.co/javierdejesusda/yuholens-14b"
            target="_blank"
            rel="noopener noreferrer"
          >
            HuggingFace
          </a>
          <a
            className="foot-link"
            href="https://github.com/javierdejesusda/YuhoLens"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          <a
            className="foot-link"
            href={LABLAB_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            lablab.ai
          </a>
        </div>

        <div className="foot-row foot-row--bot">
          <span>YuhoLens v2.5 · Edition 2026-05</span>
          <span>EDINET · TSE · JFSA</span>
        </div>
      </div>
      <span className="foot-watermark jp" aria-hidden="true">朱印</span>
    </footer>
  );
}
