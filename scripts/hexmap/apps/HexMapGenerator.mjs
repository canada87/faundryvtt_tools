import { MODULE_ID } from "../../shared/constants.mjs";
import { HexMapSystem, TERRAIN_TYPES, BIOME_PRESETS } from "../HexMapSystem.mjs";
import { HexMapSettings } from "./HexMapSettings.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class HexMapGenerator extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "faundryvtt-hexmap-generator",
    classes: ["faundryvtt-tools", "hexmap-generator"],
    window: {
      icon: "fas fa-map",
      title: "HEXMAP.GeneratorTitle",
      resizable: true
    },
    position: { width: 460, height: "auto" },
    actions: {
      setMode:      HexMapGenerator.#onSetMode,
      generate:     HexMapGenerator.#onGenerate,
      openSettings: HexMapGenerator.#onOpenSettings
    }
  };

  static PARTS = {
    generator: {
      template: `modules/${MODULE_ID}/templates/hexmap/hexmap-generator.hbs`
    }
  };

  // Instance state preserved across re-renders
  _mode = "biome";
  _biome = "temperate";
  _width = 12;
  _height = 6;
  _cityCount = 3;
  _minCityDistance = 3;
  _manualWeights = {};

  async _prepareContext() {
    const settings = HexMapSystem.getSettings();
    const configuredTerrains = TERRAIN_TYPES.filter(t => settings.terrainFolders[t.id]);

    return {
      isBiomeMode:          this._mode === "biome",
      isManualMode:         this._mode === "manual",
      biomes: Object.entries(BIOME_PRESETS).map(([id, preset]) => ({
        id,
        label: game.i18n.localize(preset.labelKey),
        selected: id === this._biome
      })),
      terrains: configuredTerrains.map(t => ({
        id: t.id,
        label: game.i18n.localize(t.labelKey),
        weight: this._manualWeights[t.id] ?? 0
      })),
      width:            this._width,
      height:           this._height,
      cityCount:        this._cityCount,
      minCityDistance:  this._minCityDistance,
      hasTerrains:      configuredTerrains.length > 0
    };
  }

  /** Persist form values before re-rendering (e.g. when toggling mode) */
  _syncFormState() {
    const root = this.element;
    if (!root) return;
    this._width           = parseInt(root.querySelector("[name='width']")?.value)           || this._width;
    this._height          = parseInt(root.querySelector("[name='height']")?.value)          || this._height;
    this._cityCount       = parseInt(root.querySelector("[name='cityCount']")?.value)       ?? this._cityCount;
    this._minCityDistance = parseInt(root.querySelector("[name='minCityDistance']")?.value) || this._minCityDistance;
    this._biome           = root.querySelector("[name='biome']")?.value                     ?? this._biome;
    root.querySelectorAll("[data-weight-terrain]").forEach(input => {
      this._manualWeights[input.dataset.weightTerrain] = parseFloat(input.value) || 0;
    });
  }

  static #onSetMode(event, target) {
    this._syncFormState();
    this._mode = target.dataset.mode;
    this.render();
  }

  static async #onGenerate(event, target) {
    this._syncFormState();
    await HexMapSystem.generateMap({
      width:           this._width,
      height:          this._height,
      mode:            this._mode,
      biome:           this._biome,
      manualWeights:   this._manualWeights,
      cityCount:       this._cityCount,
      minCityDistance: this._minCityDistance
    });
  }

  static #onOpenSettings() {
    new HexMapSettings().render(true);
  }
}
