import {
  AfterViewInit,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
import { NgForm } from '@angular/forms';

@Component({
  selector: 'app-explore-container',
  templateUrl: './explore-container.component.html',
  styleUrls: ['./explore-container.component.scss'],
  standalone: false,
})
export class ExploreContainerComponent implements OnInit, AfterViewInit {
  @Input() name?: string;
  @Input() viewData: any;
  @Output() submitData: EventEmitter<any> = new EventEmitter();
  @ViewChild('ngForm') ngForm!: NgForm;
  viewArrayValues: any[] = [];
  viewArrayKeys: any[] = [];
  getViewData() {
    this.viewArrayValues = Object.values(this.viewData.data);
    this.viewArrayKeys = Object.keys(this.viewData.data);
  }
  ngOnInit(): void {
    this.getViewData();
  }
  ngAfterViewInit(): void {
    setTimeout(() => {
      this.ngForm.form.setValue(this.viewData.data);
    }, 1000);
  }
  onSubmit(form: NgForm) {
    console.log(form.value);
    this.submitData.emit(form.value);
  }
}
