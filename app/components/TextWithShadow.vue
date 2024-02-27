<template>
  <div class="text-with-shadow">
    <slot></slot>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    shadowColor?: string;
    shadowSize?: number;
    unit?: string;
  }>(),
  {
    shadowColor: "black",
    shadowSize: 0.1,
    unit: "rem",
  }
);

const straghtShadow = computed(() => `${props.shadowSize}${props.unit}`);
const diagonalShadow = computed(
  () => `${Math.sqrt((props.shadowSize * props.shadowSize) / 2)}${props.unit}`
);
const negativeStraghtShadow = computed(() => `-${straghtShadow.value}`);
const negativeDiagonalShadow = computed(() => `-${diagonalShadow.value}`);
</script>

<style scoped>
.text-with-shadow {
  text-shadow: v-bind(diagonalShadow) v-bind(diagonalShadow) v-bind(shadowColor),
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
