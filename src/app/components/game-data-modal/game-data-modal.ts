import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthenticationService, type GameData } from '../../services/authentication.service';

@Component({
  selector: 'app-game-data-modal',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './game-data-modal.html',
  styleUrl: './game-data-modal.css',
})
export class GameDataModal {
  @Output() protected readonly saved = new EventEmitter<void>();
  @Output() protected readonly cancelled = new EventEmitter<void>();
  @Input() initialGameData: GameData | null = null;
  private readonly formBuilder = inject(FormBuilder);
  private readonly authenticationService = inject(AuthenticationService);
  protected readonly raceOptions = [
    { value: 'human', label: 'Human', faction: 'alliance', image: 'human.png' },
    { value: 'dwarf', label: 'Dwarf', faction: 'alliance', image: 'nain.png' },
    { value: 'night-elf', label: 'Night Elf', faction: 'alliance', image: 'elfe.png' },
    { value: 'gnome', label: 'Gnome', faction: 'alliance', image: 'gnome.png' },
    { value: 'orc', label: 'Orc', faction: 'horde', image: 'orc.png' },
    { value: 'undead', label: 'Undead', faction: 'horde', image: 'mortVivant.png' },
    { value: 'tauren', label: 'Tauren', faction: 'horde', image: 'tauren.png' },
    { value: 'goblin', label: 'Goblin', faction: 'horde', image: 'gobelin.png' },
  ] as const;
  protected readonly classRoles: Record<string, Array<'dps' | 'tank' | 'heal'>> = {
    warrior: ['dps', 'tank'],
    paladin: ['dps', 'tank', 'heal'],
    hunter: ['dps'],
    rogue: ['dps'],
    priest: ['dps', 'heal'],
    shaman: ['dps', 'heal'],
    mage: ['dps'],
    warlock: ['dps'],
    druid: ['dps', 'tank', 'heal'],
  };
  protected readonly classOptions = [
    { value: 'warrior', label: 'Warrior', image: 'guerrier.png', races: ['human', 'dwarf', 'night-elf', 'gnome', 'orc', 'undead', 'tauren', 'goblin'] },
    { value: 'paladin', label: 'Paladin', image: 'paladin.png', races: ['human', 'dwarf', 'undead'] },
    { value: 'hunter', label: 'Hunter', image: 'chasseur.png', races: ['human', 'dwarf', 'night-elf', 'orc', 'tauren'] },
    { value: 'rogue', label: 'Rogue', image: 'voleur.png', races: ['human', 'dwarf', 'night-elf', 'gnome', 'orc', 'undead', 'goblin'] },
    { value: 'priest', label: 'Priest', image: 'pretre.png', races: ['human', 'dwarf', 'night-elf', 'gnome', 'undead'] },
    { value: 'shaman', label: 'Shaman', image: 'chaman.png', races: ['dwarf', 'orc', 'tauren'] },
    { value: 'mage', label: 'Mage', image: 'mage.png', races: ['human', 'gnome', 'undead', 'goblin', 'orc'] },
    { value: 'warlock', label: 'Warlock', image: 'demoniste.png', races: ['human', 'gnome', 'orc', 'undead', 'goblin'] },
    { value: 'druid', label: 'Druid', image: 'druide.png', races: ['night-elf', 'tauren'] },
  ] as const;

  protected selectClass(className: string): void {
    this.form.controls.className.setValue(className);
    this.form.controls.role.reset();
    this.form.controls.className.markAsTouched();
    this.errorMessage = '';
  }
  protected get availableClasses() {
    return this.classOptions.filter((classOption) => classOption.races.some((availableRace) => availableRace === this.form.controls.race.value));
  }

  protected get availableRoles(): Array<'dps' | 'tank' | 'heal'> {
    return this.classRoles[this.form.controls.className.value] ?? [];
  }
  protected readonly form = this.formBuilder.nonNullable.group({
    faction: ['', Validators.required],
    characterName: ['', [Validators.required, Validators.maxLength(24)]],
    race: ['', Validators.required],
    className: ['', Validators.required],
    role: ['', Validators.required],
  });
  protected saving = false;
  protected errorMessage = '';
  protected step = 1;

  ngOnInit(): void {
    if (this.initialGameData) {
      this.form.patchValue({
        faction: this.initialGameData.faction ?? '',
        characterName: this.initialGameData.characterName ?? '',
        race: this.initialGameData.race ?? '',
        className: this.initialGameData.className ?? '',
        role: this.initialGameData.role ?? '',
      });
    }
  }

  protected cancel(): void {
    this.cancelled.emit();
  }
  protected readonly factions = [
    { value: 'alliance', label: 'Alliance', image: 'alliance.png' },
    { value: 'horde', label: 'Horde', image: 'horde.png' },
  ] as const;

  protected selectFaction(faction: 'alliance' | 'horde'): void {
    this.form.controls.faction.setValue(faction);
    this.form.controls.race.reset();
    this.form.controls.faction.markAsTouched();
    this.errorMessage = '';
  }

  protected get availableRaces() {
    return this.raceOptions.filter((race) => race.faction === this.form.controls.faction.value);
  }

  protected selectRace(race: string): void {
    this.form.controls.race.setValue(race);
    this.form.controls.className.reset();
    this.form.controls.race.markAsTouched();
    this.errorMessage = '';
  }

  protected nextStep(): void {
    const controlName = ['faction', 'race', 'className', 'role'][this.step - 1];
    const control = this.form.controls[controlName as 'faction' | 'race' | 'className' | 'role'];
    control.markAsTouched();
    if (control.invalid) {
      return;
    }
    this.errorMessage = '';
    this.step += 1;
  }

  protected previousStep(): void {
    this.errorMessage = '';
    this.step -= 1;
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving = true;
    this.errorMessage = '';
    try {
      const values = this.form.getRawValue();
      const faction: GameData['faction'] = values.faction === 'alliance' || values.faction === 'horde'
        ? values.faction
        : null;
      const role: GameData['role'] = values.role === 'dps' || values.role === 'tank' || values.role === 'heal'
        ? values.role
        : null;
      if (!faction || !role) {
        this.errorMessage = 'Sélectionne un rôle pour ton personnage.';
        return;
      }

      await this.authenticationService.updateGameData({
        faction,
        characterName: values.characterName,
        race: values.race,
        className: values.className,
        role,
      });
      this.saved.emit();
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Impossible d’enregistrer le personnage.';
    } finally {
      this.saving = false;
    }
  }
}
