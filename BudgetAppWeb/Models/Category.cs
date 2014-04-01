using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Linq;
using System.Web;

namespace BudgetAppWeb.Models
{
    public class Category
    {
        private DateTime _dateCreated;
        private DateTime _dateUpdated;

        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public long Id { get; set; }

        [Required]
        [Column(TypeName = "VARCHAR")]
        [StringLength(255)]
        [Index]
        public string Name { get; set; }

        /// <summary>
        /// The linker for the foreign key
        /// </summary>
        [Required]
        [ForeignKey("Budget")]
        public virtual string BudgetId { get; set; }
        /// <summary>
        /// A foreign key from the Budget table for which this expense belongs
        /// </summary>
        public virtual Budget Budget { get; set; }

        /// <summary>
        /// The database generated date for which this budget was created
        /// </summary>
        [Index]
        public DateTime DateCreated { get { return _dateCreated; } set { _dateCreated = new DateTime(value.Ticks, DateTimeKind.Utc); } }
        /// <summary>
        /// The database generated date for which this expense was last updated
        /// </summary>
        [Index]
        public DateTime DateUpdated { get { return _dateUpdated; } set { _dateUpdated = new DateTime(value.Ticks, DateTimeKind.Utc); } }

        public bool? IsDeleted { get; set; }

        public override string ToString()
        {
            return string.Format("ID: {0,50}\nName: {1,43}", Id, Name);
        }
    }
}