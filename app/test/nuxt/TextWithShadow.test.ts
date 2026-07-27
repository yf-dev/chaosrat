import { mountSuspended } from "@nuxt/test-utils/runtime";
import TextWithShadow from "~/components/TextWithShadow.vue";

// `mountSuspended` wraps the component in its own Suspense/app-root element
// (an unclassed `<div data-v-app="">`), so `wrapper.element` /
// `wrapper.classes()` reflect that wrapper, not the component's own
// `<div class="text-with-shadow">` template root. Every assertion below that
// cares about the component's root therefore drills down to it explicitly via
// `.find(".text-with-shadow")` instead of using the top-level wrapper.

describe("TextWithShadow", () => {
  it("renders the slot content inside a single '.text-with-shadow' div when no html prop is given", async () => {
    const wrapper = await mountSuspended(TextWithShadow, {
      slots: {
        default: "hello world",
      },
    });

    // Exactly one element child was produced by the component (ignoring any
    // compiler-preserved HTML comment nodes, which aren't `Element`s).
    expect(wrapper.element.children.length).toBe(1);

    const root = wrapper.find(".text-with-shadow");
    expect(root.exists()).toBe(true);
    expect(root.element.tagName).toBe("DIV");
    expect(root.classes()).toContain("text-with-shadow");
    expect(root.element.children.length).toBe(0);
    expect(root.text()).toBe("hello world");
  });

  it("renders the html prop as real DOM inside the root div, not escaped text", async () => {
    const wrapper = await mountSuspended(TextWithShadow, {
      props: {
        html: "a <b>bold</b> word",
      },
    });

    const root = wrapper.find(".text-with-shadow");
    expect(root.exists()).toBe(true);
    expect(root.element.tagName).toBe("DIV");
    expect(root.classes()).toContain("text-with-shadow");

    const bold = root.find("b");
    expect(bold.exists()).toBe(true);
    expect(bold.text()).toBe("bold");
    expect(root.text()).toBe("a bold word");
  });

  it("renders the same single root tag and class in both the slot and html branches", async () => {
    const slotWrapper = await mountSuspended(TextWithShadow, {
      slots: { default: "hi" },
    });
    const htmlWrapper = await mountSuspended(TextWithShadow, {
      props: { html: "<i>hi</i>" },
    });

    const slotRoot = slotWrapper.find(".text-with-shadow");
    const htmlRoot = htmlWrapper.find(".text-with-shadow");

    expect(slotRoot.exists()).toBe(true);
    expect(htmlRoot.exists()).toBe(true);
    expect(slotRoot.element.tagName).toBe(htmlRoot.element.tagName);
    expect(slotRoot.classes()).toEqual(["text-with-shadow"]);
    expect(htmlRoot.classes()).toEqual(["text-with-shadow"]);
  });

  it("lets fallthrough attributes (class, style) land on the root in both branches", async () => {
    const slotWrapper = await mountSuspended(TextWithShadow, {
      attrs: {
        class: "message",
        style: { display: "inline" },
      },
      slots: { default: "hi" },
    });
    const htmlWrapper = await mountSuspended(TextWithShadow, {
      attrs: {
        class: "message",
        style: { display: "inline" },
      },
      props: { html: "<span>hi</span>" },
    });

    const slotRoot = slotWrapper.find(".text-with-shadow");
    const htmlRoot = htmlWrapper.find(".text-with-shadow");

    expect(slotRoot.classes()).toContain("message");
    expect(slotRoot.classes()).toContain("text-with-shadow");
    expect(slotRoot.attributes("style")).toContain("display: inline");

    expect(htmlRoot.classes()).toContain("message");
    expect(htmlRoot.classes()).toContain("text-with-shadow");
    expect(htmlRoot.attributes("style")).toContain("display: inline");
  });

  it("prefers the html prop over slot content when both are supplied", async () => {
    const wrapper = await mountSuspended(TextWithShadow, {
      props: { html: "<em>from html</em>" },
      slots: { default: "from slot" },
    });

    const root = wrapper.find(".text-with-shadow");
    expect(root.text()).toBe("from html");
    expect(root.find("em").exists()).toBe(true);
    expect(root.text()).not.toContain("from slot");
  });

  it("does not sanitize the html prop: the string is inserted verbatim (sanitization is the caller's responsibility)", async () => {
    // `onclick` is an attribute any real sanitizer (e.g. sanitize-html) strips.
    // Its unmistakable, unsanitized presence here proves this component does
    // no sanitization of its own -- it is NOT safe to feed untrusted input.
    const wrapper = await mountSuspended(TextWithShadow, {
      props: { html: '<span onclick="doSomething()">click</span>' },
    });

    const span = wrapper.find("span");
    expect(span.exists()).toBe(true);
    expect(span.attributes("onclick")).toBe("doSomething()");
  });

  it("mounts with shadowSize/unit/shadowColor props in both branches", async () => {
    // The text-shadow itself is driven by `v-bind()` scoped-CSS custom
    // properties (see TextWithShadow.vue's <style> block). In this test
    // environment (@nuxt/test-utils' `mountSuspended` + happy-dom) those
    // custom properties are NOT observable: no <style> is injected into
    // `document.head` and the root element's `style` has zero declarations
    // regardless of `shadowSize`/`unit`/`shadowColor` (confirmed by dumping
    // `root.element.style.cssText` and `document.head.innerHTML`, both
    // empty). So this test does not -- and cannot -- assert anything about
    // the actual shadow value here; it only pins that supplying these props
    // doesn't break mounting or the root class, in both branches.
    const slotWrapper = await mountSuspended(TextWithShadow, {
      props: { shadowSize: 0.5, unit: "rem", shadowColor: "red" },
      slots: { default: "hi" },
    });
    const htmlWrapper = await mountSuspended(TextWithShadow, {
      props: {
        html: "<i>hi</i>",
        shadowSize: 0.5,
        unit: "rem",
        shadowColor: "red",
      },
    });

    expect(slotWrapper.find(".text-with-shadow").classes()).toContain(
      "text-with-shadow",
    );
    expect(htmlWrapper.find(".text-with-shadow").classes()).toContain(
      "text-with-shadow",
    );
  });
});
