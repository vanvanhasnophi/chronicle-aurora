/**
 * Generic manager-side schema field registry.
 * Plugins can register custom editor components by `x-chronicle-class` /
 * `x-widget` value without the core schema renderer importing them.
 */
import type { Component } from 'vue'

const fields = new Map<string, Component>()

export function registerSchemaField(name: string, component: Component): void {
  if (name) fields.set(name, component)
}

export function getSchemaField(name: string | undefined): Component | undefined {
  return name ? fields.get(name) : undefined
}
