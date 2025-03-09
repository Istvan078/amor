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
import { ConfigService } from '../services/config.service';

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
  labels: any = {};
  constructor(private config: ConfigService) {}
  getViewData() {
    if (this.viewData?.firstName) {
      this.viewArrayValues = Object.values(this.viewData);
      this.labels = this.config.getLabels(true);
      this.viewArrayKeys = Object.keys(this.viewData);
    }
    if (this.viewData?.data) {
      this.viewArrayValues = Object.values(this.viewData.data);
      this.viewArrayKeys = Object.keys(this.viewData.data);
    }
  }
  ngOnInit(): void {
    setTimeout(() => {
      this.getViewData();
      console.log(this.viewData);
    }, 2000);
  }
  ngAfterViewInit(): void {
    if (this.viewData?.data)
      setTimeout(() => {
        this.ngForm.form.setValue(this.viewData.data);
      }, 1000);
  }
  onSubmit(form: NgForm) {
    console.log(form.value);
    this.submitData.emit(form.value);
  }
}
