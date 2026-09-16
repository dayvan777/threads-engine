import type { ElementHandle, Page } from 'playwright';
import { cleanLabel, matchOption, type DiscoveredField } from './form';

export interface DiscoveredForm {
  fields: DiscoveredField[];
  /** Reasons the form cannot be auto-completed at all (e.g. required extra file uploads). */
  blockers: string[];
}

type EH = ElementHandle<SVGElement | HTMLElement>;

async function questionLabel(container: EH): Promise<string> {
  const text = await container
    .evaluate((el) => {
      const labels = Array.from(el.querySelectorAll('label'));
      const pure = labels.find((l) => !l.querySelector('input,select,textarea'));
      const candidate =
        pure ??
        el.querySelector('.application-label, legend, .label, .text') ??
        labels[0] ??
        null;
      return candidate?.textContent ?? '';
    })
    .catch(() => '');
  return cleanLabel(text);
}

async function isRequired(container: EH): Promise<boolean> {
  return container
    .evaluate((el) => {
      const labelText = el.querySelector('label, .application-label, legend')?.textContent ?? '';
      if (labelText.includes('*') || labelText.includes('✱')) return true;
      const control = el.querySelector('input, select, textarea');
      return Boolean(
        control &&
          (control.hasAttribute('required') || control.getAttribute('aria-required') === 'true'),
      );
    })
    .catch(() => false);
}

async function controlKey(control: EH): Promise<string> {
  return control
    .evaluate((el) => el.getAttribute('name') || el.getAttribute('id') || '')
    .catch(() => '');
}

interface LabeledInput {
  label: string;
  handle: EH;
}

async function labeledInputs(container: EH, selector: string): Promise<LabeledInput[]> {
  const handles = (await container.$$(selector)) as EH[];
  const out: LabeledInput[] = [];
  for (const h of handles) {
    const label = await h
      .evaluate((el) => {
        const wrap = el.closest('label');
        if (wrap) return wrap.textContent ?? '';
        const id = el.getAttribute('id');
        if (id) {
          const forLabel = document.querySelector(`label[for="${CSS.escape(id)}"]`);
          if (forLabel) return forLabel.textContent ?? '';
        }
        return el.getAttribute('value') ?? '';
      })
      .catch(() => '');
    out.push({ label: cleanLabel(label), handle: h });
  }
  return out;
}

async function selectOptions(select: EH): Promise<Array<{ label: string; value: string }>> {
  const options = await select
    .evaluate((el) =>
      Array.from((el as unknown as HTMLSelectElement).options).map((o) => ({
        label: (o.textContent ?? '').trim(),
        value: o.value,
      })),
    )
    .catch(() => [] as Array<{ label: string; value: string }>);
  return options.filter((o) => o.value !== '' && !/^(please\s+)?(select|choose)\b/i.test(o.label));
}

/**
 * Generic extraction of question fields from ATS form containers.
 * Every fill callback is defensive: it returns false rather than throwing,
 * so an unfillable answer degrades to a pending question, not a crash.
 */
export async function discoverContainerFields(
  page: Page,
  containerSelector: string,
  skipKeys: Set<string>,
): Promise<DiscoveredForm> {
  const fields: DiscoveredField[] = [];
  const blockers: string[] = [];
  const containers = (await page.$$(containerSelector)) as EH[];

  for (const container of containers) {
    try {
      const label = await questionLabel(container);
      const required = await isRequired(container);

      const select = (await container.$('select')) as EH | null;
      const textarea = (await container.$('textarea')) as EH | null;
      const textInput = (await container.$(
        'input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input[type="number"], input:not([type])',
      )) as EH | null;
      const radios = await labeledInputs(container, 'input[type="radio"]');
      const checkboxes = await labeledInputs(container, 'input[type="checkbox"]');
      const file = (await container.$('input[type="file"]')) as EH | null;

      const control = select ?? textarea ?? textInput ?? radios[0]?.handle ?? checkboxes[0]?.handle ?? file;
      if (!control || !label) continue;
      const key = await controlKey(control);
      if (key && skipKeys.has(key)) continue;

      if (file && !select && !textarea && !textInput && radios.length === 0 && checkboxes.length === 0) {
        if (required) blockers.push(`requires an extra file upload: "${label}"`);
        continue;
      }

      if (select) {
        const options = await selectOptions(select);
        fields.push({
          q: { question: label, fieldKey: key, fieldType: 'select', options: options.map((o) => o.label), required },
          fill: async (answer) => {
            const matched = matchOption(options.map((o) => o.label), answer);
            if (!matched) return false;
            const value = options.find((o) => o.label === matched)?.value;
            if (value === undefined) return false;
            try {
              await (select as EH).selectOption(value);
              return true;
            } catch {
              return false;
            }
          },
        });
      } else if (radios.length > 0) {
        fields.push({
          q: { question: label, fieldKey: key, fieldType: 'radio', options: radios.map((r) => r.label), required },
          fill: async (answer) => {
            const matched = matchOption(radios.map((r) => r.label), answer);
            const target = radios.find((r) => r.label === matched);
            if (!target) return false;
            try {
              await target.handle.check();
              return true;
            } catch {
              return false;
            }
          },
        });
      } else if (checkboxes.length > 1) {
        fields.push({
          q: {
            question: `${label} (multiple choice)`,
            fieldKey: key,
            fieldType: 'checkbox',
            options: checkboxes.map((c) => c.label),
            required,
          },
          fill: async (answer) => {
            let any = false;
            for (const part of answer.split(';').map((s) => s.trim()).filter(Boolean)) {
              const matched = matchOption(checkboxes.map((c) => c.label), part);
              const target = checkboxes.find((c) => c.label === matched);
              if (target) {
                try {
                  await target.handle.check();
                  any = true;
                } catch {
                  /* keep going */
                }
              }
            }
            return any;
          },
        });
      } else if (checkboxes.length === 1) {
        fields.push({
          q: { question: label, fieldKey: key, fieldType: 'checkbox', options: ['Yes', 'No'], required },
          fill: async (answer) => {
            if (!/^(yes|ja|true|agree|i agree|acknowledge|confirm)/i.test(answer.trim())) return false;
            try {
              await checkboxes[0]!.handle.check();
              return true;
            } catch {
              return false;
            }
          },
        });
      } else if (textarea || textInput) {
        const target = (textarea ?? textInput) as EH;
        fields.push({
          q: { question: label, fieldKey: key, fieldType: textarea ? 'textarea' : 'text', required },
          fill: async (answer) => {
            try {
              await target.fill(answer);
              return true;
            } catch {
              return false;
            }
          },
        });
      }
    } catch {
      // one broken container never aborts the whole form
    }
  }
  return { fields, blockers };
}
