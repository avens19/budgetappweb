using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Data.Entity.ModelConfiguration.Conventions;

namespace BudgetAppWeb.Models
{
    public class Expense
    {
        private DateTime _date;
        private DateTime _dateCreated;
        private DateTime _dateUpdated;

        /// <summary>
        /// A unique ID for this expense
        /// </summary>
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public long Id { get; set; }
        /// <summary>
        /// The date for which this expense item was incurred
        /// </summary>
        public DateTime Date { get { return _date; } set { _date = new DateTime(value.Ticks, DateTimeKind.Utc); } }
        /// <summary>
        /// A small description of this expense
        /// </summary>
        [Required]
        [Column(TypeName = "VARCHAR")]
        [StringLength(255)]
        [Index]
        public string Description { get; set; }
        /// <summary>
        /// The amount of currency this expense cost
        /// </summary>
        public double Amount { get; set; }
        /// <summary>
        /// The linker for the foreign key
        /// </summary>
        [ForeignKey("Budget")]
        public virtual string BudgetId { get; set; }
        /// <summary>
        /// A foreign key from the Budget table for which this expense belongs
        /// </summary>
        public virtual Budget Budget { get; set; }
        /// <summary>
        /// The linker for the foreign key
        /// </summary>
        [ForeignKey("Category")]
        public virtual long? CategoryId { get; set; }
        /// <summary>
        /// A foreign key from the Budget table for which this expense belongs
        /// </summary>
        public virtual Category Category { get; set; }
        /// <summary>
        /// The database generated date for which this expense was created
        /// </summary>
        [Index]
        public DateTime DateCreated { get { return _dateCreated; } set { _dateCreated = new DateTime(value.Ticks, DateTimeKind.Utc); } }
        /// <summary>
        /// The database generated date for which this expense was last updated
        /// </summary>
        [Index]
        public DateTime DateUpdated { get { return _dateUpdated; } set { _dateUpdated = new DateTime(value.Ticks, DateTimeKind.Utc); } }
        /// <summary>
        /// Indicates a deleted expense
        /// </summary>
        public bool? IsDeleted { get; set; }

        /// <summary>
        /// Indicates a system expense
        /// </summary>
        public bool? IsSystem { get; set; }

        public override string ToString()
        {
            return string.Format("ID: {0,50}\nBudget ID: {1,43}\nDate: {2,48}\nAmount: {3,46}\nDescription: {4,41}", Id, BudgetId, Date.ToString("d"), Amount.ToString("C"), Description);
        }
    }
}