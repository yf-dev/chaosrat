<template>
  <!-- eslint-disable-next-line vue/no-v-html -- the `html` prop's contract (see below) requires callers to pass HTML that is already safe to inject verbatim; this component does nothing to it -->
  <div v-if="html !== undefined" class="text-with-shadow" v-html="html" />
  <div v-else class="text-with-shadow">
    <slot />
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    /**
     * HTML to render in place of the default slot, already safe to inject
     * verbatim.
     *
     * The caller is responsible for making this string safe before passing
     * it in (e.g. via `messageHtml()` in lib/utils.ts, which HTML-escapes
     * it) — this component sets it via `v-html` verbatim and does nothing
     * to it itself. Leave this unset to render `<slot />` instead.
     */
    html?: string;
    shadowColor?: string;
    shadowSize?: number;
    unit?: string;
  }>(),
  {
    html: undefined,
    shadowColor: "black",
    shadowSize: 0.1,
    unit: "rem",
  },
);

const straghtShadow = computed(() => `${props.shadowSize}${props.unit}`);
const diagonalShadow = computed(
  () => `${Math.sqrt((props.shadowSize * props.shadowSize) / 2)}${props.unit}`,
);
const negativeStraghtShadow = computed(() => `-${straghtShadow.value}`);
const negativeDiagonalShadow = computed(() => `-${diagonalShadow.value}`);
</script>

<style scoped>
.text-with-shadow {
  text-shadow:
    v-bind(diagonalShadow) v-bind(diagonalShadow) v-bind(shadowColor),
    v-bind(straghtShadow) 0 v-bind(shadowColor),
    v-bind(diagonalShadow) v-bind(negativeDiagonalShadow) v-bind(shadowColor),
    0 v-bind(negativeStraghtShadow) v-bind(shadowColor),
    v-bind(negativeDiagonalShadow) v-bind(negativeDiagonalShadow)
      v-bind(shadowColor),
    v-bind(negativeStraghtShadow) 0 v-bind(shadowColor),
    v-bind(negativeDiagonalShadow) v-bind(diagonalShadow) v-bind(shadowColor),
    0 v-bind(straghtShadow) v-bind(shadowColor);
}
</style>
