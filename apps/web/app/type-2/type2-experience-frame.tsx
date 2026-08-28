"use client";

import { useState } from "react";

import { useGlymizeLocale } from "../components/use-glymize-locale";
import Type2ScenariosClient from "./type2-scenarios-client";

const STEPS = [
  { fa: "قند و درمان فعلی", en: "Glycemia & regimen" },
  { fa: "فنوتیپ و عوامل تصمیم", en: "Phenotype & factors" },
  { fa: "بیمه، هزینه و ترجیح", en: "Access & preference" },
  { fa: "سناریوها و دلایل", en: "Scenarios & rationale" },
] as const;

function findPrimarySections() {
  return Array.from(document.querySelectorAll<HTMLElement>(
    '.glymize-internal-shell[data-route="type-2"] form[class*="form"] > section[class*="section"]',
  ));
}

function scrollToType2Target(target: HTMLElement | null | undefined) {
  if (!target) return;

  const shell = document.querySelector<HTMLElement>('.glymize-internal-shell[data-route="type-2"]');
  const focused = shell?.dataset.layoutPreset === "focused_workflow";

  if (!focused) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const topbar = document.querySelector<HTMLElement>(".global-topbar");
  const stepper = document.querySelector<HTMLElement>(".type2-v3-stepper");

  const topbarHeight = topbar?.getBoundingClientRect().height ?? 72;
  const stepperHeight = stepper?.getBoundingClientRect().height ?? 64;
  const visualGap = 22;

  const targetTop = window.scrollY + target.getBoundingClientRect().top;
  const destination = targetTop - topbarHeight - stepperHeight - visualGap;

  window.scrollTo({
    top: Math.max(0, destination),
    behavior: "smooth",
  });
}

export default function Type2ExperienceFrame() {
  const { locale } = useGlymizeLocale();
  const [activeStep, setActiveStep] = useState(1);

  function goToStep(step: number) {
    if (step === 4) {
      const results = document.querySelector<HTMLElement>(
        '.glymize-internal-shell[data-route="type-2"] [class*="results"]',
      );

      if (!results) {
        setActiveStep(3);
        window.requestAnimationFrame(() => {
          scrollToType2Target(document.querySelector<HTMLElement>(
            '.glymize-internal-shell[data-route="type-2"] [class*="submitBar"]',
          ));
        });
        return;
      }
    }

    setActiveStep(step);

    window.requestAnimationFrame(() => {
      if (step <= 3) {
        scrollToType2Target(findPrimarySections()[step - 1]);
        return;
      }

      scrollToType2Target(document.querySelector<HTMLElement>(
        '.glymize-internal-shell[data-route="type-2"] [class*="results"]',
      ));
    });
  }

  return (
    <div className="type2-v3-frame" data-type2-step={activeStep}>
      <nav
        className="type2-v3-stepper"
        aria-label={locale === "fa" ? "مراحل تصمیم‌یار دیابت نوع ۲" : "Type 2 decision-support steps"}
      >
        {STEPS.map((step, index) => {
          const number = index + 1;
          const active = activeStep === number;

          return (
            <button
              aria-current={active ? "step" : undefined}
              className={active ? "active" : ""}
              key={step.en}
              onClick={() => goToStep(number)}
              type="button"
            >
              <span>{number}</span>
              <b>{step[locale]}</b>
            </button>
          );
        })}
      </nav>

      <Type2ScenariosClient />
    </div>
  );
}